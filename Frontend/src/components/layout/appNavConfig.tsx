import {
  BriefcaseBusiness,
  CircleDollarSign,
  CircleHelp,
  FileText,
  History,
  Layers3,
  LayoutGrid,
  LogOut,
  PhoneCall,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react'
import type { SidebarItem } from './AppSidebar'

export const appPrimaryNav: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'inventory', label: 'Inventory', icon: Layers3 },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'customer', label: 'Customer', icon: Users },
  { id: 'finance', label: 'Finance', icon: CircleDollarSign },
  { id: 'hrms', label: 'HRMS', icon: BriefcaseBusiness },
  { id: 'communication', label: 'Communication', icon: PhoneCall },
  { id: 'activity', label: 'Activity Log', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export const appSecondaryNav: SidebarItem[] = [
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'help', label: 'Help Center', icon: CircleHelp },
  { id: 'signout', label: 'Sign Out', icon: LogOut },
]
