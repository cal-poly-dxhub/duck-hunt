"use client";

import { scavengerHuntApi } from "@/api/scavengerHuntApi";
import { useGame } from "@/constants/GameProvider";
import {
  ActionIcon,
  Box,
  Button,
  Container,
  Flex,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import "@mantine/core/styles.css";
import { frontendConfig } from "@shared/config";
import { Message, MessageRole, UUID } from "@shared/types";
import {
  IconCheck,
  IconSend,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { v4 } from "uuid";

// Render markdown from the LLM (bold, italics, lists, links) while keeping the
// retro-terminal look: monospace, green, and laid out inline so the prefix and
// blinking cursor still sit on the same line as short replies.
const markdownComponents: Components = {
  p: ({ children }) => <span>{children}</span>,
  ul: ({ children }) => (
    <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>{children}</ol>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--mantine-color-green-3)", textDecoration: "underline" }}
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code style={{ fontFamily: "monospace", opacity: 0.9 }}>{children}</code>
  ),
};

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
  const [typingMessages, setTypingMessages] = useState<Record<string, string>>(
    {}
  );
  const [needsTeamPhoto, setNeedsTeamPhoto] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [photoSaved, setPhotoSaved] = useState<boolean>(false);
  // Bumped after a successful photo upload to re-trigger the /level fetch, so
  // the page advances on its own instead of the player having to refresh.
  const [refreshCounter, setRefreshCounter] = useState<number>(0);

  // Location consent: undefined = not yet decided (show modal), true/false = decided.
  const [locationConsent, setLocationConsent] = useState<boolean | undefined>(
    undefined
  );

  const {
    userId,
    teamId,
    setUserId,
    setTeamId,
    isLoading: gameLoading,
  } = useGame();

  // Load any prior location decision from localStorage (once per device).
  useEffect(() => {
    const stored = localStorage.getItem("locationConsent");
    if (stored === "granted") setLocationConsent(true);
    else if (stored === "denied") setLocationConsent(false);
    // else leave undefined so the consent modal shows
  }, []);

  const handleLocationDecision = (granted: boolean) => {
    localStorage.setItem("locationConsent", granted ? "granted" : "denied");
    setLocationConsent(granted);
  };

  const loadingMessage: Message<MessageRole.Assistant> = {
    id: v4() as UUID,
    content: "Loading...",
    role: MessageRole.Assistant,
    createdAt: new Date(),
  };

  const typeMessage = async (message: Message) => {
    for (let i = 0; i <= message.content.length; i++) {
      setTypingMessages((prev) => ({
        ...prev,
        [message.id]: message.content.slice(0, i),
      }));
      if (i < message.content.length) {
        await new Promise((resolve) => setTimeout(resolve, 12)); // Slightly slower for better effect
      }
    }

    // Remove from typing messages when complete
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
    setLoading(true);
    setInput("");
    setTypingMessages({}); // Clear any typing messages
    setMessages([
      {
        id: v4() as UUID,
        content: "Loading...",
        role: MessageRole.Assistant,
        createdAt: new Date(),
      },
    ]);

    const { message } = await scavengerHuntApi.clearChat();

    setMessages([message]);
    typeMessage(message); // Add typing effect for the clear chat response
    setLoading(false);
  };

  const searchParams = useSearchParams();
  const teamIdFromUrl = searchParams.get("team-id");
  const levelIdFromUrl = searchParams.get("level-id");

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
      setMessages([loadingMessage]);
      const {
        mapLink,
        currentTeamLevel,
        messageHistory,
        requiresPhoto,
        endScreen,
      } = await scavengerHuntApi.level(levelIdFromUrl);

      console.log("INFO: Fetched level data:", {
        currentTeamLevel,
        messageHistory,
        mapLink,
        requiresPhoto,
        endScreen,
      });

      // Hunt complete: send the winner to the win screen, everyone else to the
      // finish screen. Static pages live in frontend/public (served at root).
      if (endScreen === "win") {
        window.location.href = "/win.html";
        return;
      }
      if (endScreen === "finish") {
        window.location.href = "/finish.html";
        return;
      }

      if (requiresPhoto) {
        setNeedsTeamPhoto(true);
      }

      if (mapLink !== null) {
        // if map link is not null, open it in a new tab
        console.log("INFO: Opening map link:", mapLink);
        window.open(mapLink, "_blank");
      }

      setMessages(messageHistory);
      typeMessage(messageHistory[messageHistory.length - 1]);
      setLoading(false);
    };

    if (teamId && userId) {
      handleCheckLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, teamId, levelIdFromUrl, refreshCounter]);

  // ping location interval — only runs after the player consents to location.
  useEffect(() => {
    if (locationConsent !== true) return;

    const interval = setInterval(() => {
      scavengerHuntApi.pingCoordinates();
    }, frontendConfig.coordinatePingIntervalMs);

    return () => clearInterval(interval);
  }, [locationConsent]);

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
      <style>{blinkAnimation}</style>
      <style>{dotAnimation}</style>

      {/* Location Consent Modal — shown once per device before any location ping */}
      <Modal
        closeOnClickOutside={false}
        closeButtonProps={{ style: { display: "none" } }}
        opened={!gameLoading && !!teamId && locationConsent === undefined}
        onClose={() => {}}
        title="📍 Location Access"
        centered
        size="lg"
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
          <Text c="green.5" mb="sm" fw={700}>
            Duck Hunt uses your device&apos;s location during the game.
          </Text>
          <Text c="green.5" mb="sm" size="sm">
            <b>What we collect:</b> While you&apos;re playing, the game
            periodically records your team&apos;s approximate GPS coordinates
            (roughly every 10 seconds).
          </Text>
          <Text c="green.5" mb="sm" size="sm">
            <b>Why:</b> Your location is used <b>only</b> to power the live game
            dashboard — it lets the game organizers see where teams are on
            campus during the hunt (for coordination and fun). It is{" "}
            <b>not</b> used to identify you personally, is <b>not</b> shared
            with any third party, and is <b>not</b> used for advertising or any
            purpose beyond running this event.
          </Text>
          <Text c="green.5" mb="sm" size="sm">
            <b>How long we keep it:</b> Your location data lives only inside
            this game&apos;s private database and is <b>deleted along with all
            game data when the event is over</b>. It is not retained after the
            hunt ends.
          </Text>
          <Text c="green.5" mb="md" size="sm">
            <b>Your choice:</b> Location sharing is part of the game experience.
            If you don&apos;t enable it, you can still play and chat with the
            characters, but your team won&apos;t appear on the live dashboard.
            Your browser will also ask for its own permission — you can change
            or revoke it any time in your browser settings.
          </Text>
          <Flex gap="sm">
            <Button
              fullWidth
              color="green"
              style={{ fontFamily: "monospace" }}
              onClick={() => handleLocationDecision(true)}
            >
              Enable Location &amp; Play
            </Button>
            <Button
              fullWidth
              variant="outline"
              color="green"
              style={{ fontFamily: "monospace" }}
              onClick={() => handleLocationDecision(false)}
            >
              Play Without Location
            </Button>
          </Flex>
        </Box>
      </Modal>

      {/* Team Photo Upload Modal */}
      <Modal
        closeOnClickOutside={false}
        closeButtonProps={{ style: { display: "none" } }}
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
          {photoSaved ? (
            <Text c="green.5" mb="md">
              <IconCheck
                size="1rem"
                style={{ verticalAlign: "middle", marginRight: 6 }}
              />
              Photo saved! Loading your next clue...
            </Text>
          ) : (
            <Text c="green.5" mb="md">
              Please upload a team photo to continue with the game. If your team
              has already uploaded a photo, refresh the page or contact the
              GameMakers.
            </Text>
          )}
          <input
            type="file"
            id="team-photo"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadingPhoto(true);
              try {
                const result = await scavengerHuntApi.uploadTeamPhoto(file);
                if (result.success) {
                  // Confirm success, then re-fetch level so the page advances
                  // automatically (no manual refresh needed).
                  setPhotoSaved(true);
                  setTimeout(() => {
                    setNeedsTeamPhoto(false);
                    setPhotoSaved(false);
                    setUploadingPhoto(false);
                    setRefreshCounter((c) => c + 1);
                  }, 1500);
                } else {
                  setUploadingPhoto(false);
                  alert(`Error: ${result.error}`);
                }
              } catch (error) {
                console.error("Error uploading team photo:", error);
                setUploadingPhoto(false);
                alert("Failed to upload team photo. Please try again.");
              } finally {
                // allow re-selecting the same file if a retry is needed
                e.target.value = "";
              }
            }}
          />
          {!photoSaved && (
            <Button
              fullWidth
              disabled={uploadingPhoto}
              leftSection={
                uploadingPhoto ? (
                  <Loader size="1rem" color="green" />
                ) : (
                  <IconUpload size="1rem" />
                )
              }
              onClick={() => document.getElementById("team-photo")?.click()}
              color="green"
              style={{ fontFamily: "monospace" }}
            >
              {uploadingPhoto ? "Uploading..." : "Upload Team Photo"}
            </Button>
          )}
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
              // Check if this message is currently being typed
              const isTyping = typingMessages[message.id] !== undefined;
              const displayContent = isTyping
                ? typingMessages[message.id]
                : message.content;

              const isAssistant = message.role === MessageRole.Assistant;
              const prefix = isAssistant ? "> " : "$ ";

              const isLoadingMessage =
                message.content === "Loading..." && loading;

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
                            animation: `dot 1.4s infinite`,
                            animationDelay: "0s",
                          }}
                        >
                          .
                        </span>
                        <span
                          style={{
                            animation: `dot 1.4s infinite`,
                            animationDelay: "0.2s",
                          }}
                        >
                          .
                        </span>
                        <span
                          style={{
                            animation: `dot 1.4s infinite`,
                            animationDelay: "0.4s",
                          }}
                        >
                          .
                        </span>
                      </span>
                    </span>
                  ) : isAssistant ? (
                    <>
                      {prefix}
                      <Box
                        component="span"
                        style={{ display: "inline" }}
                      >
                        <ReactMarkdown components={markdownComponents}>
                          {displayContent}
                        </ReactMarkdown>
                      </Box>
                    </>
                  ) : (
                    prefix + displayContent
                  )}
                  {message.role === MessageRole.Assistant &&
                    !isLoadingMessage &&
                    (isTyping || displayContent === message.content) && (
                      <Box
                        component="span"
                        style={{
                          display: "inline-block",
                          width: "0.5rem",
                          height: "1rem",
                          backgroundColor: "var(--mantine-color-green-5)",
                          animation: `blink 1s infinite`,
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
