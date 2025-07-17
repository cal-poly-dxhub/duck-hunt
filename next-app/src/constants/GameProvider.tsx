"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface GameContextType {
  teamId?: string;
  setTeamId: (id: string) => void;
  clearTeamId: () => void;
  isLoading: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const GameProvider = ({ children }: { children: ReactNode }) => {
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const handleSetTeamId = (id: string) => {
    console.log("INFO: GameProvider - setting teamId:", id);
    setTeamId(id);
    localStorage.setItem("teamId", id);
  };

  const handleClearTeamId = () => {
    setTeamId(undefined);
    localStorage.removeItem("teamId");
  };

  useEffect(() => {
    const i = localStorage.getItem("teamId");
    console.log("INFO: GameProvider - teamId from localStorage:", i);
    if (i) {
      setTeamId(i);
    }

    setIsLoading(false);
  }, []);

  return (
    <GameContext.Provider
      value={{
        teamId,
        setTeamId: handleSetTeamId,
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
