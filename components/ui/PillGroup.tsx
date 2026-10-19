/**
 * The select chevron, the select class and the pill group of `/schedule/<league>`'s filters panel
 * (components/schedule/FiltersPanel.tsx). No directive: they render inside that client module.
 */

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

export function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 text-ink-3"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

// A disabled select (the static fallback, which is all a reader without JavaScript ever sees)
// LOOKS disabled: dead controls that look live are worse than none.
export const SELECT =
  'h-11 w-full appearance-none rounded-chip border border-hairline bg-surface pl-4 pr-9 text-base text-ink disabled:cursor-not-allowed disabled:text-ink-3';

export function PillGroup<T extends string>({
  legend,
  value,
  options,
  onPick,
  disabled = false,
}: {
  legend: string;
  value: T;
  options: PillOption<T>[];
  onPick: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0 text-micro font-medium text-ink-3">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onPick(option.value)}
              // The pressed pill is inverse ink plus an aria-hidden check, exactly like the selected
              // `.sx-league-chip` above it (DESIGN §26.1): one selected look on the page, never
              // colour alone. box-shadow is dropped in forced colours, so each pill gets a real
              // border there and the pressed one a Highlight ring as well as its check.
              // Press state, for touch as much as the mouse (`.sx-tap:active` alone loses to the
              // utility background): an unpressed pill steps one plane up from its rest fill
              // (surface → surface-2 in the in-flow tray below 1024px, surface-2 → surface-3 in the
              // floating one from there); the pressed one keeps its ink.
              className={`sx-tap inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-control px-4 text-meta disabled:cursor-not-allowed forced-colors:border forced-colors:border-[ButtonBorder] ${
                active
                  ? 'bg-ink font-semibold text-surface forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-[Highlight]'
                  : 'bg-surface font-medium text-ink-2 shadow-[var(--sx-ring)] hover:bg-surface-3 active:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-surface lg:bg-surface-2 lg:shadow-none lg:active:bg-surface-3 lg:disabled:hover:bg-surface-2'
              }`}
            >
              {/* Always laid out, shown only when pressed, and the label holds its semibold width
                  at either weight (`.sx-weight-hold`, globals.css): a selection never changes a
                  pill's width, so its neighbours and the wrapped rows stay put. Before the hold
                  the pressed pill was 0.6–1.4px wider than at rest ("All" 66.1 against 65.5). */}
              <span aria-hidden="true" className={active ? 'sx-check' : 'sx-check invisible'} />
              <span className="sx-weight-hold" data-label={option.label}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
