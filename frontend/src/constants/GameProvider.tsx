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
  };

  const handleSetTeamId = (id: string) => {
    console.log("INFO: GameProvider - setting teamId:", id);
    setTeamId(id);
    localStorage.setItem("teamId", id);
  };

  const handleClearUserId = () => {
    setUserId(undefined);
    localStorage.removeItem("userId");
  };

  const handleClearTeamId = () => {
    setTeamId(undefined);
    localStorage.removeItem("teamId");
  };

  useEffect(() => {
    const i = localStorage.getItem("teamId");
    if (i) {
      setTeamId(i);
    } else {
      console.warn("INFO: GameProvider - no teamId found in localStorage");
    }

    const u = localStorage.getItem("userId");
    if (u) {
      setUserId(u);
    } else {
      console.warn("INFO: GameProvider - no userId found in localStorage");
    }

    setIsLoading(false);
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
