"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface GameContextType {
  userId?: string;
  teamId?: string;
  setUserId: (id: string) => void;
  setTeamId: (id: string) => void;
  clearUserId: () => void;
  clearTeamId: () => void;
  isLoading: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const GameProvider = ({ children }: { children: ReactNode }) => {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const handleSetUserId = (id: string) => {
    console.log("INFO: GameProvider - setting userId:", id);
    setUserId(id);
    localStorage.setItem("userId", id);
    localStorage.setItem("userIdSetAt", new Date().toISOString());
  };

  const handleSetTeamId = (id: string) => {
    console.log("INFO: GameProvider - setting teamId:", id);
    setTeamId(id);
    localStorage.setItem("teamId", id);
    localStorage.setItem("teamIdSetAt", new Date().toISOString());
  };

  const handleClearUserId = () => {
    setUserId(undefined);
    localStorage.removeItem("userId");
    localStorage.removeItem("userIdSetAt");
  };

  const handleClearTeamId = () => {
    setTeamId(undefined);
    localStorage.removeItem("teamId");
    localStorage.removeItem("teamIdSetAt");
  };

  // init userId and teamId from localStorage
  useEffect(() => {
    const storageUserId = localStorage.getItem("userId");
    const storageUserIdSetDate = localStorage.getItem("userIdSetAt");

    if (storageUserId && storageUserIdSetDate) {
      const timeSinceSet =
        new Date().getTime() - new Date(storageUserIdSetDate ?? "").getTime();
      if (timeSinceSet < 1000 * 60 * 60 * 24) {
        // > 24 hours - set userId from localStorage
        console.log("INFO: GameProvider - setting userId from localStorage.");
        // console.log("INFO: GameProvider - userId:", userId);
        setUserId(storageUserId);
      } else {
        console.warn("WARN: GameProvider - userId in localStorage is stale");
      }
    } else {
      console.warn("WARN: GameProvider - no userId found in localStorage");
    }

    const storageTeamId = localStorage.getItem("teamId");
    const storageTeamIdSetDate = localStorage.getItem("teamIdSetAt");

    if (storageTeamId && storageTeamIdSetDate) {
      const timeSinceSet =
        new Date().getTime() - new Date(storageTeamIdSetDate ?? "").getTime();
      if (timeSinceSet < 1000 * 60 * 60 * 24) {
        // > 24 hours - set teamId from localStorage
        console.log("INFO: GameProvider - setting teamId from localStorage.");
        // console.log("INFO: GameProvider - teamId:", teamId);
        setTeamId(storageTeamId);
      } else {
        console.warn("WARN: GameProvider - teamId in localStorage is stale");
      }
    } else {
      console.warn("WARN: GameProvider - no teamId found in localStorage");
    }

    setIsLoading(false);
  }, []);

  // for testing
  useEffect(() => {
    // localStorage.setItem("teamId", "00572ed0-7017-4b92-a972-ce97159e776c");
    // localStorage.setItem("teamIdSetAt", new Date().toISOString());
    // localStorage.setItem("userId", "5ea84ad9-1145-4df1-9e20-835215726207");
    // localStorage.setItem("userIdSetAt", new Date().toISOString());
    // localStorage.clear();
  }, []);

  return (
    <GameContext.Provider
      value={{
        userId,
        teamId,
        setUserId: handleSetUserId,
        setTeamId: handleSetTeamId,
        clearUserId: handleClearUserId,
        clearTeamId: handleClearTeamId,
        isLoading,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

const useGame = (): GameContextType => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
};

export { GameProvider, useGame };
