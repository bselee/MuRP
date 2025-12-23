/**
 * Skills Panel Component
 *
 * Displays available Claude Code skills from the database.
 * Skills are pre-defined automation workflows that can be invoked via CLI or UI.
 *
 * ARCHITECTURE: Skills are fetched from skill_definitions table (single source of truth).
 * Built-in skills are seeded via migration 113_seed_builtin_agents_skills.sql.
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
  CogIcon,
  ZapIcon,
} from '../icons';
import { useSupabaseSkills, type SkillDefinitionDisplay } from '../../hooks/useSupabaseData';

// Map icon strings from database to actual components
const getIconComponent = (iconName: string | null, category: string) => {
  switch (iconName) {
    case 'rocket':
      return <RocketLaunchIcon className="w-5 h-5 text-green-400" />;
    case 'code':
      return <CodeBracketIcon className="w-5 h-5 text-blue-400" />;
    case 'shield':
      return <ShieldCheckIcon className="w-5 h-5 text-red-400" />;
    case 'cog':
      return <CogIcon className="w-5 h-5 text-purple-400" />;
    case 'bolt':
      return <ZapIcon className="w-5 h-5 text-yellow-400" />;
    default:
      // Fall back to category-based icons
      switch (category) {
        case 'deployment':
          return <RocketLaunchIcon className="w-5 h-5 text-green-400" />;
        case 'quality':
          return <CodeBracketIcon className="w-5 h-5 text-blue-400" />;
        case 'security':
          return <ShieldCheckIcon className="w-5 h-5 text-red-400" />;
        case 'automation':
          return <ZapIcon className="w-5 h-5 text-yellow-400" />;
        default:
          return <CogIcon className="w-5 h-5 text-gray-400" />;
      }
  }
};

interface SkillsPanelProps {
  onInvokeSkill?: (skillId: string) => void;
}

export const SkillsPanel: React.FC<SkillsPanelProps> = ({ onInvokeSkill }) => {
  const { data: skills, loading, error, refetch } = useSupabaseSkills();
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const getCategoryStyles = (category: SkillDefinitionDisplay['category']) => {
    switch (category) {
      case 'deployment':
        return 'bg-green-900/20 border-green-800 text-green-400';
      case 'quality':
        return 'bg-blue-900/20 border-blue-800 text-blue-400';
      case 'security':
        return 'bg-red-900/20 border-red-800 text-red-400';
      case 'automation':
        return 'bg-yellow-900/20 border-yellow-800 text-yellow-400';
      case 'custom':
      default:
        return 'bg-purple-900/20 border-purple-800 text-purple-400';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <CommandLineIcon className="w-5 h-5 text-accent-400" />
              Skills
            </h2>
            <p className="text-sm text-gray-400">Loading skills...</p>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-700 rounded-lg" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-700 rounded w-1/3 mb-2" />
                  <div className="h-4 bg-gray-700 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <CommandLineIcon className="w-5 h-5 text-accent-400" />
              Skills
            </h2>
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400">
          <p className="font-medium">Failed to load skills</p>
          <p className="text-sm mt-1">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

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
          {skills.length} available skills
        </div>
      </div>

      {/* Skills Grid */}
      {skills.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700">
          <CommandLineIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">No skills available</h3>
          <p className="text-sm text-gray-500 mb-4">
            Skills are seeded from the database. Run migrations to add built-in skills.
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {skills.map(skill => {
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
                        {getIconComponent(skill.icon, skill.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-white">{skill.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${getCategoryStyles(skill.category)}`}>
                            {skill.category}
                          </span>
                          {skill.isBuiltIn && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-accent-900/30 border border-accent-700 text-accent-400">
                              built-in
                            </span>
                          )}
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
                      {skill.lastUsedAt && (
                        <div>
                          <span className="text-gray-500">Last used: </span>
                          <span className="text-white">{skill.lastUsedAt.toLocaleDateString()}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Version: </span>
                        <span className="text-accent-300">{skill.version}</span>
                      </div>
                      {skill.isBuiltIn && (
                        <div>
                          <span className="text-gray-500">Location: </span>
                          <code className="text-accent-300 text-xs">.claude/skills/{skill.identifier}/SKILL.md</code>
                        </div>
                      )}
                    </div>

                    {/* Invoke Button */}
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => onInvokeSkill?.(skill.identifier)}
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
      )}

      {/* How to Use Section */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
          <CommandLineIcon className="w-4 h-4 text-accent-400" />
          How to Use Skills
        </h3>
        <div className="space-y-2 text-sm text-gray-400">
          <p>Skills are invoked via Claude Code CLI in your terminal:</p>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto">
            {skills.slice(0, 3).map(skill => (
              <div key={skill.id}>
                <span className="text-gray-500">$</span> claude <span className="text-accent-300">{skill.command}</span>
              </div>
            ))}
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
