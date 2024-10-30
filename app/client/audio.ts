import { WavRecorder, WavStreamPlayer } from "@/app/utils/wavtools";

export const SAMPLE_RATE = 24000;

export class Audio {
  private wavRecorder: WavRecorder;
  private wavStreamPlayer: WavStreamPlayer;
  isConnected: boolean = false;

  constructor() {
    this.wavRecorder = new WavRecorder({ sampleRate: SAMPLE_RATE });
    this.wavStreamPlayer = new WavStreamPlayer({ sampleRate: SAMPLE_RATE });
  }

  async connect() {
    this.isConnected = true;
    // Connect to microphone
    await this.wavRecorder.begin();
    // Connect to audio output
    await this.wavStreamPlayer.connect();
  }

  async disConnect() {
    this.isConnected = false;
    // Disconnect from microphone
    await this.wavRecorder.end();
    // Disconnect from audio output
    await this.wavStreamPlayer.interrupt();
  }

  async startRecording(callback: (data: any, chunkSize: number) => void) {
    await this.wavRecorder.record((data: any = null, chunkSize: number = 0) =>
      callback(data, chunkSize),
    );
  }

  async stopRecording() {
    await this.wavRecorder.pause();
  }

  async connectStreamPlayer() {
    await this.wavStreamPlayer.connect();
  }

  async interruptStreamPlayer() {
    return await this.wavStreamPlayer.interrupt();
  }

  getRecorderFrequencies(type: string) {
    return this.wavRecorder.getFrequencies(type);
  }

  getStreamPlayerFrequencies(type: string) {
    return this.wavStreamPlayer.getFrequencies(type);
  }

  getRecorderStatus() {
    return this.wavRecorder.getStatus();
  }

  async endRecorder() {
    await this.wavRecorder.end();
  }

  async addStreamPlayerAudio(data: any, trackId: string) {
    this.wavStreamPlayer.add16BitPCM(data, trackId);
  }
}
