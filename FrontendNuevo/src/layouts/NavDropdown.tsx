import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

export type NavDropdownLink = {
  to: string;
  label: string;
};

export function NavDropdown({ label, links }: { label: string; links: NavDropdownLink[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="menu-dropdown" ref={ref}>
      <button
        type="button"
        className={`menu-dropdown-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {label}
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="menu-dropdown-panel" role="menu">
          {links.map((link) => (
            <Link key={link.to} to={link.to} role="menuitem" onClick={() => setIsOpen(false)}>
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
