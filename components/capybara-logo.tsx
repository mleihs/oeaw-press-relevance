import { cn } from '@/lib/utils';

interface CapybaraLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 24,
  md: 48,
  lg: 120,
};

export function CapybaraLogo({ size = 'md', className }: CapybaraLogoProps) {
  const px = SIZES[size];

  if (size === 'sm') {
    // Simplified silhouette for navbar
    return (
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn('shrink-0', className)}
        aria-hidden="true"
      >
        {/* Capybara head silhouette with magnifying glass */}
        <ellipse cx="12" cy="13" rx="8" ry="6.5" fill="currentColor" opacity="0.9" />
        <ellipse cx="7" cy="9" rx="3.5" ry="3" fill="currentColor" />
        <ellipse cx="17" cy="9" rx="3.5" ry="3" fill="currentColor" />
        <ellipse cx="12" cy="11" rx="6" ry="4.5" fill="currentColor" />
        {/* Ears */}
        <ellipse cx="6" cy="6.5" rx="2" ry="1.5" fill="currentColor" />
        <ellipse cx="18" cy="6.5" rx="2" ry="1.5" fill="currentColor" />
        {/* Eyes */}
        <circle cx="9" cy="10" r="1" fill="white" opacity="0.95" />
        <circle cx="15" cy="10" r="1" fill="white" opacity="0.95" />
        <circle cx="9.3" cy="10" r="0.5" fill="currentColor" />
        <circle cx="15.3" cy="10" r="0.5" fill="currentColor" />
        {/* Nose */}
        <ellipse cx="12" cy="13" rx="2.5" ry="1.5" fill="currentColor" opacity="0.6" />
        <circle cx="11.2" cy="12.5" r="0.5" fill="white" opacity="0.5" />
        <circle cx="12.8" cy="12.5" r="0.5" fill="white" opacity="0.5" />
        {/* Magnifying glass */}
        <circle cx="19" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.8" />
        <line x1="21" y1="19" x2="23" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      </svg>
    );
  }

  // Medium and large — more detailed capybara with magnifying glass
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="60" cy="75" rx="38" ry="28" fill="#8B6914" />
      {/* Head */}
      <ellipse cx="60" cy="50" rx="28" ry="22" fill="#A07A1A" />
      {/* Ears */}
      <ellipse cx="38" cy="32" rx="6" ry="5" fill="#8B6914" />
      <ellipse cx="82" cy="32" rx="6" ry="5" fill="#8B6914" />
      <ellipse cx="38" cy="32" rx="4" ry="3" fill="#BFA04A" />
      <ellipse cx="82" cy="32" rx="4" ry="3" fill="#BFA04A" />
      {/* Snout */}
      <ellipse cx="60" cy="58" rx="14" ry="9" fill="#BFA04A" />
      {/* Eyes */}
      <circle cx="48" cy="46" r="4" fill="white" />
      <circle cx="72" cy="46" r="4" fill="white" />
      <circle cx="49" cy="46" r="2.5" fill="#2D1A00" />
      <circle cx="73" cy="46" r="2.5" fill="#2D1A00" />
      <circle cx="49.8" cy="45" r="0.8" fill="white" />
      <circle cx="73.8" cy="45" r="0.8" fill="white" />
      {/* Nostrils */}
      <circle cx="56" cy="56" r="1.8" fill="#6B4E0A" />
      <circle cx="64" cy="56" r="1.8" fill="#6B4E0A" />
      {/* Mouth */}
      <path d="M54 62 Q60 66 66 62" stroke="#6B4E0A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Whiskers */}
      <line x1="44" y1="56" x2="30" y2="54" stroke="#6B4E0A" strokeWidth="0.8" opacity="0.5" />
      <line x1="44" y1="58" x2="30" y2="60" stroke="#6B4E0A" strokeWidth="0.8" opacity="0.5" />
      <line x1="76" y1="56" x2="90" y2="54" stroke="#6B4E0A" strokeWidth="0.8" opacity="0.5" />
      <line x1="76" y1="58" x2="90" y2="60" stroke="#6B4E0A" strokeWidth="0.8" opacity="0.5" />
      {/* Front legs */}
      <ellipse cx="42" cy="95" rx="7" ry="10" fill="#8B6914" />
      <ellipse cx="78" cy="95" rx="7" ry="10" fill="#8B6914" />
      {/* Paws */}
      <ellipse cx="42" cy="103" rx="8" ry="3" fill="#6B4E0A" />
      <ellipse cx="78" cy="103" rx="8" ry="3" fill="#6B4E0A" />
      {/* Magnifying glass held by right paw */}
      <circle cx="95" cy="82" r="12" stroke="#0047bb" strokeWidth="3" fill="white" fillOpacity="0.3" />
      <circle cx="95" cy="82" r="9" stroke="#0047bb" strokeWidth="1.5" fill="white" fillOpacity="0.15" />
      <line x1="104" y1="91" x2="112" y2="102" stroke="#0047bb" strokeWidth="4" strokeLinecap="round" />
      {/* Glint on magnifying glass */}
      <path d="M89 76 Q91 74 93 76" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function CapybaraEmpty({ message, submessage }: { message: string; submessage?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CapybaraLogo size="lg" />
      <h3 className="mt-4 font-medium text-lg text-neutral-700">{message}</h3>
      {submessage && (
        <p className="mt-1 text-sm text-neutral-500 max-w-md">{submessage}</p>
      )}
    </div>
  );
}
