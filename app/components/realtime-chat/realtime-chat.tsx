import VoiceIcon from "@/app/icons/voice.svg";
import Close24Icon from "@/app/icons/close-24.svg";
import styles from "./realtime-chat.module.scss";
export function RealtimeChat() {
  return (
    <div className={styles["realtime-chat"]}>
      <div className={styles["circle-mic"]}>
        <div className={styles["icon-center"]}></div>
      </div>
      <div className={styles["bottom-icons"]}>
        <div className={styles["icon-left"]}>
          <VoiceIcon />
        </div>
        <div className={styles["icon-right"]}>
          <Close24Icon />
        </div>
      </div>
    </div>
  );
}
