import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpDown,
  ArrowUpToLine,
  AtSign,
  BarChart3,
  Bell,
  Bookmark,
  Bot,
  Box,
  Braces,
  Building2,
  Cpu,
  Calendar as CalendarIconBase,
  CalendarClock,
  CalendarDays,
  Calculator,
  Check,
  CheckCircle,
    CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  CircleDollarSign,
  CircleHelp,
  ClipboardCopy,
  ClipboardList,
  Clock,
  CloudUpload,
  Code2,
  Copy,
  Database,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Flag,
  FlaskConical,
  Folder,
  Globe,
  Grid2X2,
  GripVertical,
  Hash,
  Home,
  Image,
  Inbox,
  Info,
  KeyRound,
  LayoutPanelLeft,
  Lightbulb,
  Link2,
  List,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Package,
    Palette,
  PenSquare,
  Pencil,
  Play,
  Plus,
  Printer,
  PlusCircle,
  QrCode,
  RefreshCcw,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Slack,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Sun,
  Table2,
  History,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  UserPlus,
  Users,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

type IconProps = { className?: string };

const wrapIcon = (Icon: LucideIcon) => ({ className }: IconProps) => (
  <Icon className={className} strokeWidth={1.7} />
);

export const MuRPLogo = ({ className }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 80 32" fill="currentColor">
    <text x="0" y="24" fontSize="20" fontWeight="bold" fontFamily="Inter, system-ui, -apple-system, sans-serif">
      MuRP
    </text>
  </svg>
);

export const MagicSparklesIcon = wrapIcon(Sparkles);
export const AiSwirlIcon = wrapIcon(RefreshCw);
export const RobotIcon = wrapIcon(Bot);
export const MuRPBotIcon = wrapIcon(Bot);
export const CpuChipIcon = wrapIcon(Cpu);

export const BoxIcon = wrapIcon(Box);
export const CheckCircleIcon = wrapIcon(CheckCircle);
export const CheckCircle2Icon = wrapIcon(CheckCircle2);
export const ShieldCheckIcon = wrapIcon(ShieldCheck);
export const ExclamationCircleIcon = wrapIcon(AlertCircle);
export const AlertCircleIcon = ExclamationCircleIcon;
export const XCircleIcon = wrapIcon(XCircle);
export const BotIcon = wrapIcon(Bot);
export const ChevronDownIcon = wrapIcon(ChevronDown);
export const SendIcon = wrapIcon(Send);
export const CloseIcon = wrapIcon(X);
export const PaletteIcon = wrapIcon(Palette);
export const RefreshCcwIcon = wrapIcon(RefreshCcw);

export const HomeIcon = wrapIcon(Home);
export const PackageIcon = wrapIcon(Package);
export const TruckIcon = wrapIcon(Truck);
export const DocumentTextIcon = wrapIcon(FileText);
export const UsersIcon = wrapIcon(Users);
export const BuildingOffice2Icon = wrapIcon(Building2);
export const ChartBarIcon = wrapIcon(BarChart3);
export const CogIcon = wrapIcon(Settings);
export const SettingsIcon = wrapIcon(Settings);
export const BeakerIcon = wrapIcon(FlaskConical);
export const SearchIcon = wrapIcon(Search);
export const BellIcon = wrapIcon(Bell);
export const CalculatorIcon = wrapIcon(Calculator);
export const LightBulbIcon = wrapIcon(Lightbulb);
export const ChevronDoubleLeftIcon = wrapIcon(ChevronsLeft);
export const InformationCircleIcon = wrapIcon(Info);
export const WrenchScrewdriverIcon = wrapIcon(Wrench);
export const PencilIcon = wrapIcon(Pencil);
export const PrinterIcon = wrapIcon(Printer);
export const TrashIcon = wrapIcon(Trash2);
export const ClipboardListIcon = wrapIcon(ClipboardList);
export const PhotoIcon = wrapIcon(Image);
export const LogoutIcon = wrapIcon(LogOut);
export const ChevronUpIcon = wrapIcon(ChevronUp);
export const MailIcon = wrapIcon(Mail);
export const FileTextIcon = wrapIcon(FileText);
export const GmailIcon = MailIcon;
export const GoogleSheetsIcon = wrapIcon(FileSpreadsheet);
export const GoogleCalendarIcon = wrapIcon(CalendarClock);
export const GoogleDocsIcon = wrapIcon(FileText);
export const KeyIcon = wrapIcon(KeyRound);
export const ClipboardCopyIcon = wrapIcon(ClipboardCopy);
export const RefreshIcon = wrapIcon(RefreshCw);
export const PlayIcon = wrapIcon(Play);
export const ServerStackIcon = wrapIcon(Server);
export const LinkIcon = wrapIcon(Link2);
export const PlusCircleIcon = wrapIcon(PlusCircle);
export const UserPlusIcon = wrapIcon(UserPlus);
export const PencilSquareIcon = wrapIcon(PenSquare);
export const ArrowDownTrayIcon = wrapIcon(ArrowDownToLine);
export const ArrowUpTrayIcon = wrapIcon(ArrowUpToLine);
export const ArrowsRightLeftIcon = wrapIcon(ArrowRightLeft);
export const ArrowRightIcon = wrapIcon(ArrowRight);
export const TimelineIcon = wrapIcon(History);
export const SparklesIcon = wrapIcon(Sparkles);
export const DocumentDuplicateIcon = wrapIcon(Copy);
export const FlagIcon = wrapIcon(Flag);
export const GripVerticalIcon = wrapIcon(GripVertical);
export const ArrowsUpDownIcon = wrapIcon(ArrowUpDown);
export const EyeIcon = wrapIcon(Eye);
export const EyeSlashIcon = wrapIcon(EyeOff);
export const ClockIcon = wrapIcon(Clock);
export const XMarkIcon = wrapIcon(X);
export const CheckIcon = wrapIcon(Check);
export const BookmarkIcon = wrapIcon(Bookmark);
export const PlusIcon = wrapIcon(Plus);
export const CloudUploadIcon = wrapIcon(CloudUpload);
export const ClipboardDocumentListIcon = wrapIcon(ClipboardList);
export const QrCodeIcon = wrapIcon(QrCode);
export const AdjustmentsHorizontalIcon = wrapIcon(SlidersHorizontal);
export const MagnifyingGlassIcon = SearchIcon;
export const Squares2X2Icon = wrapIcon(Grid2X2);
export const ListBulletIcon = wrapIcon(List);
export const ExclamationTriangleIcon = wrapIcon(AlertTriangle);
export const AlertTriangleIcon = ExclamationTriangleIcon;
export const SaveIcon = wrapIcon(Save);
export const TrendingUpIcon = wrapIcon(TrendingUp);
export const TrendingDownIcon = wrapIcon(TrendingDown);
export const CalendarIcon = wrapIcon(CalendarIconBase);
export const CalendarDaysIcon = wrapIcon(CalendarDays);
export const TableCellsIcon = wrapIcon(Table2);
export const DollarSignIcon = wrapIcon(DollarSign);
export const FolderIcon = wrapIcon(Folder);
export const UserIcon = wrapIcon(User);
export const ArrowPathIcon = wrapIcon(RefreshCw);
export const ViewColumnsIcon = wrapIcon(LayoutPanelLeft);
export const QuestionMarkCircleIcon = wrapIcon(CircleHelp);
export const ChatBubbleIcon = wrapIcon(MessageCircle);
export const PaperAirplaneIcon = wrapIcon(Send);
export const Bars3BottomLeftIcon = wrapIcon(Menu);
export const ChevronRightIcon = wrapIcon(ChevronRight);
export const InboxIcon = wrapIcon(Inbox);
export const CurrencyDollarIcon = wrapIcon(CircleDollarSign);
export const ArrowTopRightOnSquareIcon = wrapIcon(ExternalLink);
export const ExternalLinkIcon = ArrowTopRightOnSquareIcon;
export const ClipboardIcon = wrapIcon(ClipboardList);
export const SlackIcon = wrapIcon(Slack);
export const GlobeIcon = wrapIcon(Globe);
export const HashtagIcon = wrapIcon(Hash);
export const AtSymbolIcon = wrapIcon(AtSign);
export const SunIcon = wrapIcon(Sun);
export const ShoppingCartIcon = wrapIcon(ShoppingCart);

// Skills & Agent Icons
export const RocketLaunchIcon = wrapIcon(Rocket);
export const CodeBracketIcon = wrapIcon(Code2);
export const CommandLineIcon = wrapIcon(SquareTerminal);
export const BracesIcon = wrapIcon(Braces);
export const ZapIcon = wrapIcon(Zap);
export const DatabaseIcon = wrapIcon(Database);
