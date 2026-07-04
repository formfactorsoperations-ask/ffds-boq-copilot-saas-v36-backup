
import React from 'react';
import { AIStrategy } from '../types';
import Card from './shared/Card';
import { AI_STRATEGIES } from '../constants';

interface AIStrategyTabProps {
  aiStrategy: AIStrategy;
  setAiStrategy: (strategy: AIStrategy) => void;
}

const AIStrategyTab: React.FC<AIStrategyTabProps> = ({ aiStrategy, setAiStrategy }) => {
  return (
    <Card title="AI Strategy Control">
      <p className="text-sm text-slate-600 mb-6">
        Select an AI Persona to guide its logic for all smart calculations and suggestions. This choice will influence how the AI estimates quantities, splits costs, and optimizes margins.
      </p>
      <div className="space-y-4">
        {AI_STRATEGIES.map(strategy => (
          <div
            key={strategy.id}
            onClick={() => setAiStrategy(strategy.id as AIStrategy)}
            className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 flex gap-4 items-center ${
              aiStrategy === strategy.id
                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-300'
                : 'bg-white hover:bg-slate-50'
            }`}
          >
            <div className="text-3xl bg-white p-2 rounded-full shadow-sm border">{strategy.icon}</div>
            <div>
                <h4 className="font-bold text-indigo-900">{strategy.name}</h4>
                <p className="text-sm text-slate-600 mt-1">{strategy.description}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default AIStrategyTab;
