"use client";

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, Send, Settings, BarChart3 } from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sources', href: '/sources', icon: BookOpen },
    { name: 'Run Center', href: '/runs', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav className="hidden md:block w-64 bg-white border-r border-gray-200">
        <div className="h-full overflow-y-auto">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900">Cadensend</h2>
          </div>
          <nav className="space-y-1 p-2">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </nav>
      <main id="main-content" className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
