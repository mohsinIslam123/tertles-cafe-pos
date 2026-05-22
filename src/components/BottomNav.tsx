import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
  label: string;
  icon: string;      // emoji for now — swap with SVG icons in Phase 8
  path: string;
  available: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home',      icon: '🏠', path: '/',          available: true  },
  { label: 'Items',     icon: '🍽️',  path: '/items',     available: true  },
  { label: 'Customers', icon: '👥', path: '/customers', available: true  },
  { label: 'Reports',   icon: '📊', path: '/reports',   available: true  },
  { label: 'More',      icon: '⋯',  path: '/more',      available: true  },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-bottom z-40">
      <div className="flex">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => {
                if (item.available) navigate(item.path);
              }}
              className={`
                flex-1 flex flex-col items-center gap-1 py-2.5
                transition-colors duration-150
                ${isActive
                  ? 'text-brand-600'
                  : item.available
                    ? 'text-gray-400 active:text-gray-600'
                    : 'text-gray-200 cursor-not-allowed'
                }
              `}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-brand-600' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-10 h-0.5 bg-brand-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
