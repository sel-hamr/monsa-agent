export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface MessageListProps {
  messages: Message[];
}
