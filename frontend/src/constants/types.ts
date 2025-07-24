export interface Message {
  id: number;
  text: string;
  sender: "user" | "system";
  timestamp: Date;
}
