/**
 * Icon set — thin wrappers over **lucide-react** (P6 "adopt standard
 * libraries"): the glyphs themselves are versioned, maintained library code
 * instead of hand-drawn paths, while call sites keep importing the project's
 * stable names (`BookmarkIcon`, `ShieldCheckIcon`, …).
 *
 * Wrapper contract (unchanged from the original hand-drawn set):
 * - 24×24 viewBox, stroke-based, `strokeWidth` 1.75, `currentColor`-driven so
 *   they inherit text color in every context,
 * - decorative (`aria-hidden`, `focusable="false"`), sized by the caller's
 *   `className` (CSS size wins over the library's width/height attributes),
 * - RTL-safe: symmetric glyphs or direction-neutral.
 */
import {
  ArrowRight,
  Award,
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Compass,
  Eye,
  Globe,
  Handshake,
  Heart,
  IdCard,
  Inbox,
  Mail,
  MapPin,
  Menu,
  Paperclip,
  Pause,
  Play,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  UserRound,
  Users,
  X,
  type LucideProps,
} from 'lucide-react';

type IconProps = { className?: string };

/** Decorative default layer over a lucide glyph. */
function icon(Presentation: React.ComponentType<LucideProps>) {
  return function Icon({ className }: IconProps): React.ReactElement {
    return (
      <Presentation className={className} strokeWidth={1.75} aria-hidden="true" focusable="false" />
    );
  };
}

/** Volunteer identity card. */
export const IdCardIcon = icon(IdCard);

/** Verified experience / certificate award. */
export const AwardIcon = icon(Award);

/** Compass for opportunities discovery. */
export const CompassIcon = icon(Compass);

/** Building for organizations. */
export const BuildingIcon = icon(Building2);

/** Heart-handshake stand-in for sponsors & CSR. */
export const HeartIcon = icon(Heart);

/** Bookmark for save/favorite actions (P5) — vertical symmetry keeps RTL safe. */
export const BookmarkIcon = icon(Bookmark);

/** Globe for international programs. */
export const GlobeIcon = icon(Globe);

/** Shield with a check — verification/trust sections. */
export const ShieldCheckIcon = icon(ShieldCheck);

/** Checkmark for feature lists. */
export const CheckIcon = icon(Check);

/** Hamburger menu (three bars). */
export const MenuIcon = icon(Menu);

/** Close (×). */
export const CloseIcon = icon(X);

/** Chevron down — disclosure affordance for the account menu. */
export const ChevronDownIcon = icon(ChevronDown);

/** Chevron left — pagination "previous" (mirrored in RTL via `rtl:rotate-180`). */
export const ChevronLeftIcon = icon(ChevronLeft);

/** Chevron right — pagination "next" (mirrored in RTL via `rtl:rotate-180`). */
export const ChevronRightIcon = icon(ChevronRight);

/** Arrow right — "view all" links (mirrored in RTL via `rtl:rotate-180`). */
export const ArrowRightIcon = icon(ArrowRight);

/** Magnifier for the hero search bar. */
export const SearchIcon = icon(Search);

/** Map pin — location metadata on cards and the "near me" chip. */
export const MapPinIcon = icon(MapPin);

/** Calendar — deadline metadata on cards and the "this week" chip. */
export const CalendarIcon = icon(CalendarDays);

/** People — participant counts and the "needs volunteers" chip. */
export const UsersIcon = icon(Users);

/** Handshake — mutual support / "needs support" chip. */
export const HandshakeIcon = icon(Handshake);

/** Sliders — filter-tray trigger. */
export const SlidersIcon = icon(SlidersHorizontal);

/** Clock — verified-hours stats and fact rows. */
export const ClockIcon = icon(Clock);

/** Send — applications sent (dashboard stat + quick link). */
export const SendIcon = icon(Send);

/** Bell — notifications quick link. */
export const BellIcon = icon(Bell);

/** Mail — verify-email quick link. */
export const MailIcon = icon(Mail);

/** Paperclip — message attachments (thread bubbles + composer picker). */
export const PaperclipIcon = icon(Paperclip);

/** QR code — check-in quick link. */
export const QrCodeIcon = icon(QrCode);

/** Eye — view counts on the detail facts panel. */
export const EyeIcon = icon(Eye);

/** Target — self-reported impact metrics. */
export const TargetIcon = icon(Target);

/** Clipboard-check — attendance/hour record counts in the console. */
export const ClipboardCheckIcon = icon(ClipboardCheck);

/** Inbox — friendly empty states ("nothing here yet"). */
export const InboxIcon = icon(Inbox);

/** Person — profile quick link. */
export const UserRoundIcon = icon(UserRound);

/** Play/pause — hero slideshow controls (P26 landing motion). */
export const PlayIcon = icon(Play);

export const PauseIcon = icon(Pause);
