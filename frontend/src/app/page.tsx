"use client";

import { scavengerHuntApi } from "@/api/scavengerHuntApi";
import { useGame } from "@/constants/GameProvider";
import {
  ActionIcon,
  Box,
  Button,
  Container,
  Flex,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import "@mantine/core/styles.css";
import { Message, MessageRole, UUID } from "@shared/types";
import { IconSend, IconTrash, IconUpload } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { v4 } from "uuid";

const blinkAnimation = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
`;

const dotAnimation = `
  @keyframes dot {
    0%, 20% { opacity: 0; }
    40%, 100% { opacity: 1; }
  }
`;

export default function Chat() {
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  // TODO:
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [typingMessages, setTypingMessages] = useState<Record<string, string>>(
    {}
  );
  const [needsTeamPhoto, setNeedsTeamPhoto] = useState<boolean>(false);

  const {
    userId,
    teamId,
    setUserId,
    setTeamId,
    isLoading: gameLoading,
  } = useGame();

  const typeMessage = async (message: Message) => {
    for (let i = 0; i <= message.content.length; i++) {
      setTypingMessages((prev) => ({
        ...prev,
        [message.id]: message.content.slice(0, i),
      }));
      if (i < message.content.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    setTypingMessages((prev) => {
      const newState = { ...prev };
      delete newState[message.id];
      return newState;
    });
  };

  const handleSend = async (userMessage: string) => {
    if (userMessage.trim() === "") return;

    setLoading(true);
    setInput("");

    const newUserMessage: Message<MessageRole.User> = {
      id: v4() as UUID,
      content: userMessage,
      role: MessageRole.User,
      createdAt: new Date(),
    };

    const loadingMessage: Message<MessageRole.Assistant> = {
      id: v4() as UUID,
      content: "Loading",
      role: MessageRole.Assistant,
      createdAt: new Date(),
    };

    setMessages([...messages, newUserMessage, loadingMessage]);

    const { mapLink, message } = await scavengerHuntApi.message(newUserMessage);
    if (mapLink !== null) {
      // if map link is not null, open it in a new tab
      window.open(mapLink, "_blank");
    }

    const systemMessage: Message = {
      id: v4() as UUID,
      content: message.content,
      role: MessageRole.Assistant,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev.slice(0, -1), systemMessage]);
    typeMessage(systemMessage);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleClearChat = async () => {
    const { message } = await scavengerHuntApi.clearChat();
    setMessages([message]);
    setTypingMessages({});
  };

  const searchParams = useSearchParams();
  const teamIdFromUrl = searchParams.get("team-id");
  const levelIdFromUrl = searchParams.get("level-id");
  const endSequenceFromUrl = searchParams.get("end-sequence");

  // check for teamId and userId
  useEffect(() => {
    if (gameLoading) return;

    if (teamIdFromUrl) {
      console.warn(
        "WARN: Team ID provided in URL. Setting teamId to the provided value."
      );
      setTeamId(teamIdFromUrl);
    }

    if (!userId) {
      const newUserId = v4();
      console.warn(
        "WARN: No userId found in GameProvider. Generating a new one."
      );
      setUserId(newUserId);
    }

    if (!teamId) {
      console.error("ERROR: No team id found in GameProvider or url.");

      const message = {
        id: v4() as UUID,
        content:
          "No team id found. Try scanning your team duck again or contact support.",
        role: MessageRole.Assistant,
        createdAt: new Date(),
      };

      setMessages([message]);
      typeMessage(message);
    }
  }, [teamId, teamIdFromUrl, gameLoading, userId, setUserId, setTeamId]);

  // /level
  // fetch every page refresh
  useEffect(() => {
    const handleCheckLocation = async () => {
      const { currentTeamLevel, messageHistory, requiresPhoto } =
        await scavengerHuntApi.level(levelIdFromUrl);

      if (requiresPhoto) {
        setNeedsTeamPhoto(true);
        return;
      }

      const systemMessage = {
        id: v4() as UUID,
        content: `You are at team level: ${currentTeamLevel}.`,
        role: MessageRole.Assistant,
        createdAt: new Date(),
      };

      setMessages(messageHistory);
      typeMessage(systemMessage);
      setLoading(false);
    };

    if (teamId && userId) {
      handleCheckLocation();
    }
  }, [userId, teamId, levelIdFromUrl, endSequenceFromUrl]);

  // ping location interval
  useEffect(() => {
    const interval = setInterval(() => {
      scavengerHuntApi.pingCoordinates();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      bg="dark.9"
      style={{
        minHeight: "100dvh",
        width: "100%",
        overflowY: "hidden",
        fontFamily: "monospace",
      }}
    >
      {/* Team Photo Upload Modal */}
      <Modal
        opened={needsTeamPhoto}
        onClose={() => setNeedsTeamPhoto(false)}
        title="Team Photo Required"
        centered
        styles={{
          title: {
            fontFamily: "monospace",
            color: "var(--mantine-color-green-5)",
          },
          header: { backgroundColor: "var(--mantine-color-dark-7)" },
          content: { backgroundColor: "var(--mantine-color-dark-7)" },
        }}
      >
        <Box p="md" bg="dark.7" ff="monospace">
          <Text c="green.5" mb="md">
            Please upload a team photo to continue with the game. If your team
            has already uploaded a photo, refresh the page or contact the
            GameMakers.
          </Text>
          <input
            type="file"
            id="team-photo"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                try {
                  const result = await scavengerHuntApi.uploadTeamPhoto(file);
                  if (result.success) {
                    setNeedsTeamPhoto(false);
                  } else {
                    // TODO: better error handling
                    alert(`Error: ${result.error}`);
                  }
                } catch (error) {
                  console.error("Error uploading team photo:", error);
                  alert("Failed to upload team photo. Please try again.");
                }
              }
            }}
          />
          <Button
            fullWidth
            leftSection={<IconUpload size="1rem" />}
            onClick={() => document.getElementById("team-photo")?.click()}
            color="green"
            style={{ fontFamily: "monospace" }}
          >
            Upload Team Photo
          </Button>
        </Box>
      </Modal>

      <Container
        size="lg"
        h="100dvh"
        p="md"
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "100dvh",
        }}
      >
        <Box
          style={{
            flexGrow: 1,
            overflowY: "auto",
            paddingBottom: "1rem",
            display: "flex",
            flexDirection: "column-reverse",
          }}
        >
          <Stack gap="xs">
            {messages.map((message) => {
              const displayText =
                message.role === MessageRole.Assistant
                  ? "> " + message.content
                  : "$ " + message.content;

              const isLoadingMessage =
                message.content === "> Loading" && loading;

              return (
                <Text
                  key={message.id}
                  c="green.5"
                  style={{
                    fontFamily: "monospace",
                    fontSize: "1rem",
                    lineHeight: 1.5,
                  }}
                >
                  {isLoadingMessage ? (
                    <span>
                      {"Loading"}
                      <span
                        style={{
                          display: "inline-block",
                          width: "1rem",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            animation: `${dotAnimation} 1.4s infinite`,
                            animationDelay: "0s",
                          }}
                        >
                          .
                        </span>
                        <span
                          style={{
                            animation: `${dotAnimation} 1.4s infinite`,
                            animationDelay: "0.2s",
                          }}
                        >
                          .
                        </span>
                        <span
                          style={{
                            animation: `${dotAnimation} 1.4s infinite`,
                            animationDelay: "0.4s",
                          }}
                        >
                          .
                        </span>
                      </span>
                    </span>
                  ) : (
                    displayText
                  )}
                  {message.role === MessageRole.Assistant &&
                    !isLoadingMessage && (
                      <Box
                        component="span"
                        style={{
                          display: "inline-block",
                          width: "0.5rem",
                          height: "1rem",
                          backgroundColor: "var(--mantine-color-green-5)",
                          animation: `${blinkAnimation} 1s infinite`,
                          verticalAlign: "middle",
                          marginLeft: "0.25rem",
                        }}
                      />
                    )}
                </Text>
              );
            })}
          </Stack>
        </Box>

        <Flex gap="md" mt="auto" justify="center" align="center">
          <TextInput
            placeholder=">"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            readOnly={loading}
            autoFocus
            autoComplete="off"
            spellCheck="false"
            radius="xs"
            size="md"
            flex={1}
            styles={{
              input: {
                backgroundColor: "var(--mantine-color-dark-7)",
                color: "var(--mantine-color-green-4)",
                borderColor: "var(--mantine-color-green-9)",
                fontFamily: "monospace",
                "&:focus": {
                  borderColor: "var(--mantine-color-green-5)",
                },
              },
            }}
          />
          <ActionIcon
            size="lg"
            variant="subtle"
            color="green"
            onClick={() => handleSend(input)}
            disabled={loading || input.trim() === ""}
            aria-label="Send command"
          >
            <IconSend size="1.1rem" />
          </ActionIcon>
          <ActionIcon
            size="lg"
            variant="subtle"
            color="red"
            onClick={handleClearChat}
            disabled={loading || messages.length === 0}
            aria-label="Clear chat"
          >
            <IconTrash size="1.1rem" />
          </ActionIcon>
        </Flex>
      </Container>
    </Box>
  );
}
