import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";

import Close24Icon from "@/app/icons/close-24.svg";
import styles from "./realtime-chat.module.scss";

import { useState, useEffect, useRef, useCallback } from "react";
import { useInt16PCMAudioPlayer } from "@/app/hooks/use-stream-player";
import { useInt16PCMAudioRecorder } from "@/app/hooks/use-media-recorder";
import { RealtimeClient } from "openai-realtime-api";
import {
  useAccessStore,
  useChatStore,
  ChatMessage,
  createMessage,
} from "@/app/store";
import { uploadImage as uploadImageRemote } from "@/app/utils/chat";

interface RealtimeChatProps {
  onClose?: () => void;
  onStartVoice?: () => void;
  onPausedVoice?: () => void;
  sampleRate: number;
}

export class WavPacker {
  _packData(size, arg) {
    return [
      new Uint8Array([arg, arg >> 8]),
      new Uint8Array([arg, arg >> 8, arg >> 16, arg >> 24]),
    ][size];
  }
  pack(sampleRate, audio) {
    if (!audio?.bitsPerSample) {
      throw new Error(`Missing "bitsPerSample"`);
    } else if (!audio?.data) {
      throw new Error(`Missing "data"`);
    }
    const { bitsPerSample, channelCount, data } = audio;
    const output = [
      // Header
      "RIFF",
      this._packData(
        1,
        4 + (8 + 24) /* chunk 1 length */ + (8 + 8) /* chunk 2 length */,
      ), // Length
      "WAVE",
      // chunk 1
      "fmt ", // Sub-chunk identifier
      this._packData(1, 16), // Chunk length
      this._packData(0, 1), // Audio format (1 is linear quantization)
      this._packData(0, channelCount),
      this._packData(1, sampleRate),
      this._packData(1, (sampleRate * channelCount * bitsPerSample) / 8), // Byte rate
      this._packData(0, (channelCount * bitsPerSample) / 8),
      this._packData(0, bitsPerSample),
      // chunk 2
      "data", // Sub-chunk identifier
      this._packData(1, (data.length * channelCount * bitsPerSample) / 8), // Chunk length
      data,
    ];
    const blob = new Blob(output, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      channelCount,
      sampleRate,
      duration: data.byteLength / (channelCount * sampleRate * 2),
    };
  }
}

export function RealtimeChat({
  onClose,
  onStartVoice,
  onPausedVoice,
  sampleRate = 24000,
}: RealtimeChatProps) {
  const [isVoicePaused, setIsVoicePaused] = useState(true);
  const clientRef = useRef<RealtimeClient | null>(null);
  const currentItemId = useRef<string>("");
  const currentBotMessage = useRef<ChatMessage | null>();
  const currentUserMessage = useRef<ChatMessage | null>();
  const accessStore = useAccessStore.getState();
  const chatStore = useChatStore();
  const { isRecording, isPaused, audioData, start, stop, pause, resume } =
    useInt16PCMAudioRecorder({ sampleRate });

  const { isPlaying, startPlaying, stopPlaying, addInt16PCM, currentTime } =
    useInt16PCMAudioPlayer({ sampleRate });

  useEffect(() => {
    if (
      clientRef.current?.getTurnDetectionType() === "server_vad" &&
      audioData
    ) {
      // console.log("appendInputAudio", audioData);
      // 将录制的16PCM音频发送给openai
      clientRef.current?.appendInputAudio(audioData);
    }
  }, [audioData]);

  useEffect(() => {
    console.log("isRecording", isRecording);
    if (!isRecording.current) return;
    if (!clientRef.current) {
      const apiKey = accessStore.openaiApiKey;
      const client = (clientRef.current = new RealtimeClient({
        url: "wss://api.openai.com/v1/realtime",
        apiKey,
        dangerouslyAllowAPIKeyInBrowser: true,
        debug: true,
      }));
      client
        .connect()
        .then(() => {
          // TODO 设置真实的上下文
          client.sendUserMessageContent([
            {
              type: `input_text`,
              text: `Hi`,
              // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
            },
          ]);

          // 配置服务端判断说话人开启还是结束
          client.updateSession({
            turn_detection: { type: "server_vad" },
          });

          client.on("realtime.event", (realtimeEvent: CustomRealtimeEvent) => {
            // 调试
            console.log("realtime.event", realtimeEvent);
          });

          client.on("conversation.interrupted", async () => {
            if (currentBotMessage.current) {
              stopPlaying();
              try {
                client.cancelResponse(
                  currentBotMessage.current?.id,
                  currentTime(),
                );
              } catch (e) {
                console.error(e);
              }
            }
          });
          client.on("conversation.updated", async (event: any) => {
            // console.log("currentSession", chatStore.currentSession());
            // const items = client.conversation.getItems();
            const content = event?.item?.content?.[0]?.transcript || "";
            const text = event?.item?.content?.[0]?.text || "";
            // console.log(
            //   "conversation.updated",
            //   event,
            //   "content[0]",
            //   event?.item?.content?.[0]?.transcript,
            //   "formatted",
            //   event?.item?.formatted?.transcript,
            //   "content",
            //   content,
            //   "text",
            //   text,
            //   event?.item?.status,
            //   event?.item?.role,
            //   items.length,
            //   items,
            // );
            const { item, delta } = event;
            const { role, id, status, formatted } = item || {};
            if (id && role == "assistant") {
              if (
                !currentBotMessage.current ||
                currentBotMessage.current?.id != id
              ) {
                // create assistant message and save to session
                currentBotMessage.current = createMessage({ id, role });
                chatStore.updateCurrentSession((session) => {
                  session.messages = session.messages.concat([
                    currentBotMessage.current,
                  ]);
                });
              }
              if (currentBotMessage.current?.id != id) {
                stopPlaying();
              }
              if (content) {
                currentBotMessage.current.content = content;
                chatStore.updateCurrentSession((session) => {
                  session.messages = session.messages.concat();
                });
              }
              if (delta?.audio) {
                // typeof delta.audio is Int16Array
                // 直接播放
                addInt16PCM(delta.audio);
              }
              // console.log(
              //   "updated try save wavFile",
              //   status,
              //   currentBotMessage.current?.audio_url,
              //   formatted?.audio,
              // );
              if (
                status == "completed" &&
                !currentBotMessage.current?.audio_url &&
                formatted?.audio?.length
              ) {
                // 转换为wav文件保存 TODO 使用mp3格式会更节省空间
                const botMessage = currentBotMessage.current;
                const wavFile = new WavPacker().pack(sampleRate, {
                  bitsPerSample: 16,
                  channelCount: 1,
                  data: formatted?.audio,
                });
                // 这里将音频文件放到对象里面wavFile.url可以使用<audio>标签播放
                item.formatted.file = wavFile;
                uploadImageRemote(wavFile.blob).then((audio_url) => {
                  botMessage.audio_url = audio_url;
                  chatStore.updateCurrentSession((session) => {
                    session.messages = session.messages.concat();
                  });
                });
              }
              if (
                status == "completed" &&
                !currentBotMessage.current?.content
              ) {
                chatStore.updateCurrentSession((session) => {
                  session.messages = session.messages.filter(
                    (m) => m.id !== currentBotMessage.current?.id,
                  );
                });
              }
            }
            if (id && role == "user" && !text) {
              if (
                !currentUserMessage.current ||
                currentUserMessage.current?.id != id
              ) {
                // create assistant message and save to session
                currentUserMessage.current = createMessage({ id, role });
                chatStore.updateCurrentSession((session) => {
                  session.messages = session.messages.concat([
                    currentUserMessage.current,
                  ]);
                });
              }
              if (content) {
                // 转换为wav文件保存 TODO 使用mp3格式会更节省空间
                const userMessage = currentUserMessage.current;
                const wavFile = new WavPacker().pack(sampleRate, {
                  bitsPerSample: 16,
                  channelCount: 1,
                  data: formatted?.audio,
                });
                // 这里将音频文件放到对象里面wavFile.url可以使用<audio>标签播放
                item.formatted.file = wavFile;
                uploadImageRemote(wavFile.blob).then((audio_url) => {
                  // update message content
                  userMessage.content = content;
                  // update message audio_url
                  userMessage.audio_url = audio_url;
                  chatStore.updateCurrentSession((session) => {
                    session.messages = session.messages.concat();
                  });
                });
              }
            }
          });
        })
        .catch((e) => {
          console.error("Error", e);
        });
    }
    return () => {
      stop();
      // TODO close client
      clientRef.current?.disconnect();
    };
  }, [isRecording.current]);

  const handleStartVoice = useCallback(() => {
    onStartVoice?.();
    setIsVoicePaused(false);
    isPaused.current ? resume() : start();
  }, [isPaused.current]);

  const handlePausedVoice = () => {
    onPausedVoice?.();
    setIsVoicePaused(true);
    pause();
  };

  return (
    <div className={styles["realtime-chat"]}>
      <div className={styles["circle-mic"]}>
        <div className={styles["icon-center"]}></div>
      </div>
      <div className={styles["bottom-icons"]}>
        <div className={styles["icon-left"]}>
          {isVoicePaused ? (
            <VoiceOffIcon onClick={handleStartVoice} />
          ) : (
            <VoiceIcon onClick={handlePausedVoice} />
          )}
        </div>
        <div className={styles["icon-right"]} onClick={onClose}>
          <Close24Icon />
        </div>
      </div>
    </div>
  );
}
