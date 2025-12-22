/**
 * Skills Panel Component
 *
 * Displays available Claude Code skills with descriptions and execution triggers.
 * Skills are pre-defined automation workflows that can be invoked via CLI or UI.
 */

import React, { useState } from 'react';
import {
  RocketLaunchIcon,
  CodeBracketIcon,
  ShieldCheckIcon,
  PlayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  CommandLineIcon,
} from '../icons';

interface SkillDefinition {
  id: string;
  name: string;
  command: string;
  description: string;
  icon: React.ReactNode;
  allowedTools: string[];
  category: 'deployment' | 'quality' | 'security';
  lastUsed?: Date;
  usageCount: number;
}

// Skills defined in .claude/skills/
const SKILLS: SkillDefinition[] = [
  {
    id: 'deploy',
    name: 'Deploy to Main',
    command: '/deploy',
    description: 'Build the project, commit all changes, and deploy to main via the claude/merge-to-main branch.',
    icon: <RocketLaunchIcon className="w-5 h-5 text-green-400" />,
    allowedTools: ['Bash', 'Read', 'Glob', 'Write', 'Edit'],
    category: 'deployment',
    usageCount: 12,
  },
  {
    id: 'code-review',
    name: 'Code Review',
    command: '/code-review',
    description: 'Review code for quality, security, and best practices. Analyzes recent changes and provides actionable feedback.',
    icon: <CodeBracketIcon className="w-5 h-5 text-blue-400" />,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
    category: 'quality',
    usageCount: 28,
  },
  {
    id: 'security-review',
    name: 'Security Review',
    command: '/security-review',
    description: 'Security audit for vulnerabilities, compliance issues, and sensitive data exposure. Essential before production deployments.',
    icon: <ShieldCheckIcon className="w-5 h-5 text-red-400" />,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
    category: 'security',
    usageCount: 8,
  },
];

interface SkillsPanelProps {
  onInvokeSkill?: (skillId: string) => void;
}

export const SkillsPanel: React.FC<SkillsPanelProps> = ({ onInvokeSkill }) => {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const getCategoryStyles = (category: SkillDefinition['category']) => {
    switch (category) {
      case 'deployment':
        return 'bg-green-900/20 border-green-800 text-green-400';
      case 'quality':
        return 'bg-blue-900/20 border-blue-800 text-blue-400';
      case 'security':
        return 'bg-red-900/20 border-red-800 text-red-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CommandLineIcon className="w-5 h-5 text-accent-400" />
            Skills
          </h2>
          <p className="text-sm text-gray-400">
            Pre-defined automation workflows invoked via Claude Code CLI
          </p>
        </div>
        <div className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
          {SKILLS.length} available skills
        </div>
      </div>

      {/* Skills Grid */}
      <div className="space-y-4">
        {SKILLS.map(skill => {
          const isExpanded = expandedSkill === skill.id;

          return (
            <div
              key={skill.id}
              className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden transition-all hover:border-gray-600"
            >
              {/* Skill Header */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gray-900 rounded-lg">
                      {skill.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-white">{skill.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getCategoryStyles(skill.category)}`}>
                          {skill.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{skill.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCommand(skill.command);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                    >
                      {copiedCommand === skill.command ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4 text-green-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <DocumentTextIcon className="w-4 h-4" />
                          {skill.command}
                        </>
                      )}
                    </button>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-700 p-4 bg-gray-900/50 space-y-4">
                  {/* Allowed Tools */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Allowed Tools</h4>
                    <div className="flex flex-wrap gap-2">
                      {skill.allowedTools.map(tool => (
                        <span
                          key={tool}
                          className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded border border-gray-700"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Usage Stats */}
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Uses: </span>
                      <span className="text-white font-medium">{skill.usageCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Location: </span>
                      <code className="text-accent-300 text-xs">.claude/skills/{skill.id}/SKILL.md</code>
                    </div>
                  </div>

                  {/* Invoke Button (placeholder) */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => onInvokeSkill?.(skill.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <PlayIcon className="w-4 h-4" />
                      Run in Terminal
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* How to Use Section */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
          <CommandLineIcon className="w-4 h-4 text-accent-400" />
          How to Use Skills
        </h3>
        <div className="space-y-2 text-sm text-gray-400">
          <p>Skills are invoked via Claude Code CLI in your terminal:</p>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto">
            <span className="text-gray-500">$</span> claude <span className="text-accent-300">/deploy</span>
            <br />
            <span className="text-gray-500">$</span> claude <span className="text-accent-300">/code-review</span>
            <br />
            <span className="text-gray-500">$</span> claude <span className="text-accent-300">/security-review</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Skills defined in <code className="text-accent-300">.claude/skills/</code> are automatically loaded by Claude Code.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SkillsPanel;
