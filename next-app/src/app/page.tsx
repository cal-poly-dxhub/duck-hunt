"use client";

import { scavengerHuntApi } from "@/api/scavengerHuntApi";
import { useGame } from "@/constants/GameProvider";
import { Message } from "@/constants/types";
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
import { IconSend, IconTrash, IconUpload } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
// import Markdown from "react-markdown";

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
  const [typingMessages, setTypingMessages] = useState<Record<number, string>>(
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

  const typeMessage = async (messageId: number, fullText: string) => {
    for (let i = 0; i <= fullText.length; i++) {
      setTypingMessages((prev) => ({
        ...prev,
        [messageId]: fullText.slice(0, i),
      }));
      if (i < fullText.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    setTypingMessages((prev) => {
      const newState = { ...prev };
      delete newState[messageId];
      return newState;
    });
  };

  const handleSend = async (prompt: string) => {
    if (prompt.trim() === "") return;

    setLoading(true);
    setInput("");

    const userMessage: Message = {
      id: messages.length + 1,
      text: `$ ${prompt}`,
      sender: "user",
      timestamp: new Date(),
    };

    const loadingMessage: Message = {
      id: messages.length + 2,
      text: "> Loading",
      sender: "system",
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage, loadingMessage]);

    try {
      const data = await scavengerHuntApi.message(prompt);

      if (data.status === 406) {
        setNeedsTeamPhoto(true);
        // revert to previous messages
        setMessages((prev) => prev.slice(0, -2));
        return;
      }

      if (!data.success) {
        throw new Error(data.error || "Unknown error");
      }

      const systemMessage: Message = {
        id: messages.length + 2,
        text: `> ${data.message}`,
        sender: "system",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev.slice(0, -1), systemMessage]);
      typeMessage(systemMessage.id, systemMessage.text);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: messages.length + 2,
        text: `> Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        sender: "system",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev.slice(0, -1), errorMessage]);
      typeMessage(errorMessage.id, errorMessage.text);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleClearChat = () => {
    scavengerHuntApi.clearChat();
    setMessages([]);
    setTypingMessages({});
  };

  const searchParams = useSearchParams();
  const teamIdFromUrl = searchParams.get("team-id");
  const levelIdFromUrl = searchParams.get("level-id");
  const endSequenceFromUrl = searchParams.get("end-sequence");

  // team id
  useEffect(() => {
    if (gameLoading) {
      return;
    }

    if (!userId) {
      const newUserId = crypto.randomUUID();
      console.warn("No userId found in GameProvider. Generating a new one.");
      setUserId(newUserId);
    }

    if (teamIdFromUrl) {
      console.warn(
        "Team ID provided in URL. Setting teamId to the provided value."
      );
      setTeamId(teamIdFromUrl);

      const message = {
        id: 1,
        text: `> Team ID set to: ${teamIdFromUrl}`,
        sender: "system" as const,
        timestamp: new Date(),
      };

      setMessages([message]);
      typeMessage(message.id, message.text);
    }
  }, [teamIdFromUrl, teamId, setTeamId, gameLoading, userId, setUserId]);

  // check if ids present
  useEffect(() => {
    if (gameLoading) return;
    if (teamIdFromUrl) return;

    if (!teamId) {
      console.error(
        "No teamId found in GameProvider. Please ensure you have set a team ID."
      );
      const message = {
        id: 1,
        text: "> Error: No team ID provided in URL or GameProvider.",
        sender: "system" as const,
        timestamp: new Date(),
      };

      setMessages([message]);
      typeMessage(message.id, message.text);
    }
  }, [teamId, teamIdFromUrl, gameLoading]);

  // end sequence or at level
  useEffect(() => {
    const handleCheckLocation = async () => {
      if (endSequenceFromUrl) {
        const data = await scavengerHuntApi.finishGame(endSequenceFromUrl);
        if (!data.success) {
          console.error("Error finishing game:", data.error);
          const errorMessage = {
            id: messages.length + 1,
            text: `> Error finishing game: ${data.error || "Unknown error"}`,
            sender: "system" as const,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          typeMessage(errorMessage.id, errorMessage.text);
        } else {
          const successMessage = {
            id: messages.length + 1,
            text: `> ${data.message}`,
            sender: "system" as const,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, successMessage]);
          typeMessage(successMessage.id, successMessage.text);

          return;
        }
      }

      try {
        const data = await scavengerHuntApi.atLevel(
          levelIdFromUrl ?? "current"
        );

        if (!data.success) {
          throw new Error("Unknown error");
        }

        const systemMessage: Message = {
          id: messages.length + 1,
          text: `> You are at level: ${data.level}.`,
          sender: "system",
          timestamp: new Date(),
        };

        setMessages([
          systemMessage,
          ...((data?.messageHistory as unknown as Message[]) ?? []),
        ]);
        typeMessage(systemMessage.id, systemMessage.text);
        setLoading(false);
      } catch (error) {
        console.error("Error checking location:", error);
        const errorMessage: Message = {
          id: messages.length + 1,
          text: `> Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          sender: "system",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        typeMessage(errorMessage.id, errorMessage.text);
      }
    };

    if (teamId && userId) {
      handleCheckLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    const successMessage: Message = {
                      id: messages.length + 1,
                      text: `> ${result.message}`,
                      sender: "system",
                      timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, successMessage]);
                    typeMessage(successMessage.id, successMessage.text);
                  } else {
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
                message.sender === "system" &&
                typingMessages[message.id] !== undefined
                  ? typingMessages[message.id]
                  : message.text;

              const isLoadingMessage = message.text === "> Loading" && loading;

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
                      {"> Loading"}
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
                    // <Markdown>{displayText}</Markdown>
                    displayText
                  )}
                  {message.sender === "system" && !isLoadingMessage && (
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
            disabled={loading}
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
