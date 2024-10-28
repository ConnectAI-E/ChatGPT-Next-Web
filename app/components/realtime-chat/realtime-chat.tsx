import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";

import Close24Icon from "@/app/icons/close-24.svg";
import styles from "./realtime-chat.module.scss";

import { useState } from "react";

interface RealtimeChatProps {
  onClose?: () => void;
  onStartVoice?: () => void;
  onPausedVoice?: () => void;
}

export function RealtimeChat({
  onClose,
  onStartVoice,
  onPausedVoice,
}: RealtimeChatProps) {
  const [isVoicePaused, setIsVoicePaused] = useState(false);

  const handleStartVoice = () => {
    onStartVoice?.();
    setIsVoicePaused(false);
  };

  const handlePausedVoice = () => {
    onPausedVoice?.();
    setIsVoicePaused(true);
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
