import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/office-hours", label: "Office Hours" },
  { href: "/tasks", label: "Tasks" },
  { href: "/meetings", label: "Meetings" },
  { href: "/docs", label: "Docs" },
  { href: "/finance", label: "Finance" },
  { href: "/admin", label: "Admin" },
];

export function SiteNav() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">
          ASGC OS
        </Link>
        <nav className="flex max-w-[70%] gap-4 overflow-x-auto whitespace-nowrap text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-foreground/80 hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
