import NavLink from './NavLink';

/** The desktop nav: seven links, no sidebar, no bottom bar (DESIGN §1.3). */
export const TOP_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/standings', label: 'Standings' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/teams', label: 'Teams' },
  { href: '/playoffs', label: 'Playoffs' },
  { href: '/history/2025-26', label: 'History' },
  { href: '/about', label: 'About' },
];

export function TopNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex list-none items-center gap-1 p-0">
        {TOP_LINKS.map((link) => (
          <li key={link.href}>
            <NavLink href={link.href} variant="top" label={link.label} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default TopNav;
