

import React, { useState } from 'react';
import Card from './shared/Card';
import { SparklesIcon } from './Icons';
import { isAiAvailable } from '../services/geminiService';

interface CommandBarProps {
  onProcessCommand: (command: string) => Promise<void>;
}

const CommandBar: React.FC<CommandBarProps> = ({ onProcessCommand }) => {
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isLoading || !isAiAvailable()) return;

    setIsLoading(true);
    try {
      await onProcessCommand(command);
    } catch (error) {
      console.error("Failed to process command:", error);
      alert("An error occurred while processing the command.");
    } finally {
      setIsLoading(false);
      setCommand('');
    }
  };

  return (
    <Card title="AI Command Bar" titleIcon={<SparklesIcon className="w-4 h-4" />}>
      <p className="text-sm text-slate-600 mb-4">
        Use natural language to perform bulk actions on the <span className="font-bold">active tier</span>. Try: "Delete all electrical items" or "Increase margin for carpentry items in Bedroom 1 by 5%".
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-4 p-3 bg-slate-50 rounded-lg">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command for active tier..."
          className="flex-grow p-2 border border-slate-300 rounded-lg"
          disabled={!isAiAvailable() || isLoading}
        />
        <button
          type="submit"
          disabled={!isAiAvailable() || isLoading || !command.trim()}
          className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition"
        >
          {isLoading ? 'Processing...' : 'Execute Command'}
        </button>
      </form>
       {!isAiAvailable() && <p className="text-xs text-amber-600 mt-2">AI service not available. This feature is disabled.</p>}
    </Card>
  );
};

export default CommandBar;