/**
 * Shared modal Capybara avatar — drives both AnalysisModal (analyst with glasses
 * + clipboard) and EnrichmentModal (enricher with paper). Animations come from
 * `globals.css` (.animate-capybara-{work,celebrate,scratch,happy,shrug}).
 *
 * State enum unifies both modals' state names:
 *   running / working → work-bobble
 *   found             → brief celebrate (enricher)
 *   complete          → happy + confetti
 *   error             → scratch
 *   cancelled         → shrug
 */
export type CapybaraAvatarState =
  | 'idle'
  | 'running'
  | 'working'
  | 'found'
  | 'complete'
  | 'error'
  | 'cancelled';

interface CapybaraModalAvatarProps {
  variant: 'analyst' | 'enricher';
  state: CapybaraAvatarState;
}

const ANIM_BY_STATE: Record<CapybaraAvatarState, string> = {
  idle: '',
  running: 'animate-capybara-work',
  working: 'animate-capybara-work',
  found: 'animate-capybara-celebrate',
  complete: 'animate-capybara-happy',
  error: 'animate-capybara-scratch',
  cancelled: 'animate-capybara-shrug',
};

export function CapybaraModalAvatar({ variant, state }: CapybaraModalAvatarProps) {
  const animClass = ANIM_BY_STATE[state];
  const showWorkProp = state === 'running' || state === 'working' || state === 'found';
  return (
    <div className={`relative w-16 h-16 ${animClass}`}>
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Body + head */}
        <ellipse cx="32" cy="40" rx="18" ry="14" fill="#8B6914" />
        <ellipse cx="32" cy="24" rx="12" ry="10" fill="#A07B1E" />
        <ellipse cx="32" cy="28" rx="7" ry="5" fill="#C4A24E" />
        {variant === 'analyst' && (
          <ellipse cx="32" cy="26" rx="2.5" ry="1.5" fill="#4A3508" />
        )}

        {/* Eyes */}
        <circle cx="26" cy="22" r="2" fill="#1a1a1a" />
        <circle cx="38" cy="22" r="2" fill="#1a1a1a" />
        <circle cx="26.7" cy="21.3" r="0.7" fill="white" />
        <circle cx="38.7" cy="21.3" r="0.7" fill="white" />

        {/* Glasses (analyst only) */}
        {variant === 'analyst' && (
          <>
            <circle cx="26" cy="22" r="4" stroke="#4A3508" strokeWidth="0.8" fill="none" />
            <circle cx="38" cy="22" r="4" stroke="#4A3508" strokeWidth="0.8" fill="none" />
            <line x1="30" y1="22" x2="34" y2="22" stroke="#4A3508" strokeWidth="0.8" />
          </>
        )}

        {/* Ears */}
        <ellipse cx="22" cy="16" rx="3" ry="4" fill="#8B6914" />
        <ellipse cx="42" cy="16" rx="3" ry="4" fill="#8B6914" />
        <ellipse cx="22" cy="16" rx="2" ry="3" fill="#C4A24E" />
        <ellipse cx="42" cy="16" rx="2" ry="3" fill="#C4A24E" />

        {/* Legs */}
        <rect x="18" y="48" width="6" height="8" rx="3" fill="#8B6914" />
        <rect x="40" y="48" width="6" height="8" rx="3" fill="#8B6914" />

        {/* Mouth */}
        <path d="M29 30 Q32 32 35 30" stroke="#4A3508" strokeWidth="0.8" fill="none" strokeLinecap="round" />

        {/* Variant-specific work prop */}
        {showWorkProp && variant === 'analyst' && (
          <g>
            <rect x="22" y="35" width="20" height="16" rx="1.5" fill="white" stroke="#ccc" strokeWidth="0.5" />
            <rect x="28" y="33" width="8" height="4" rx="1" fill="#4A3508" />
            <line x1="25" y1="40" x2="39" y2="40" stroke="#10b981" strokeWidth="1" />
            <line x1="25" y1="43" x2="36" y2="43" stroke="#10b981" strokeWidth="1" opacity="0.5" />
            <line x1="25" y1="46" x2="33" y2="46" stroke="#10b981" strokeWidth="1" opacity="0.3" />
          </g>
        )}
        {showWorkProp && variant === 'enricher' && (
          <g className="origin-center">
            <rect x="24" y="36" width="16" height="12" rx="1" fill="white" stroke="#ddd" strokeWidth="0.5" />
            <line x1="27" y1="39" x2="37" y2="39" stroke="#ccc" strokeWidth="0.8" />
            <line x1="27" y1="42" x2="35" y2="42" stroke="#ccc" strokeWidth="0.8" />
            <line x1="27" y1="45" x2="33" y2="45" stroke="#ccc" strokeWidth="0.8" />
          </g>
        )}

        {/* Confetti for complete (both variants) */}
        {state === 'complete' && (
          <>
            <circle cx="10" cy="10" r="1.5" fill="#ef4444" className="animate-ping" />
            <circle cx="54" cy="8" r="1.5" fill="#3b82f6" className="animate-ping" style={{ animationDelay: '0.2s' }} />
            <circle cx="8" cy="30" r="1.5" fill="#22c55e" className="animate-ping" style={{ animationDelay: '0.4s' }} />
            <circle cx="56" cy="28" r="1.5" fill="#eab308" className="animate-ping" style={{ animationDelay: '0.3s' }} />
            {variant === 'enricher' && (
              <>
                <circle cx="20" cy="6" r="1" fill="#a855f7" className="animate-ping" style={{ animationDelay: '0.5s' }} />
                <circle cx="48" cy="4" r="1" fill="#f97316" className="animate-ping" style={{ animationDelay: '0.1s' }} />
              </>
            )}
          </>
        )}
      </svg>
    </div>
  );
}
