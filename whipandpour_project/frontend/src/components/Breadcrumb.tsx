import { ChevronRight, Home } from 'lucide-react';
import { useLocation } from 'wouter';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const [, navigate] = useLocation();

  return (
    <nav className="flex items-center gap-2 text-sm text-[#7A7066] mb-6">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 hover:text-[#C9A84C] transition-colors"
      >
        <Home size={16} />
        <span>Home</span>
      </button>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ChevronRight size={16} className="text-[#D4A5A5]" />
          {item.href ? (
            <button
              onClick={() => navigate(item.href!)}
              className="hover:text-[#C9A84C] transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-[#2C2C2C] font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
