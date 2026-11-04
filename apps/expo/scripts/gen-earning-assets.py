#!/usr/bin/env python3
"""
Generates the Rewards Center artwork SOURCES in apps/expo/design/earning/
(SVG, 64x64 art box) and the claim-burst Lottie animation in
apps/expo/assets/earning/animations/. One script so every piece shares the
same palette, gloss and outline treatment.

The app does not ship these SVGs: scripts/gen-earning-webp.mjs renders each
one to the WebP the app bundles (apps/expo/assets/earning/**.webp), adding the
raster-only finish (soft glow, drop shadow, sheen). Re-run both after editing:

    python3 apps/expo/scripts/gen-earning-assets.py
    node apps/expo/scripts/gen-earning-webp.mjs

Gradient ids are prefixed per file, so several different SVGs inlined on one
web page never resolve each other's gradients.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "design", "earning")
ANIM_ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "earning")

GOLD = ("#FFF3A6", "#FFD54A", "#F59E0B")
PURPLE = ("#E9D5FF", "#A855F7", "#5B21B6")
MAGENTA = ("#FBCFE8", "#EC4899", "#9D174D")
CYAN = ("#CFFAFE", "#22D3EE", "#2563EB")
GREEN = ("#D1FAE5", "#34D399", "#047857")
ORANGE = ("#FFEDD5", "#FB923C", "#C2410C")
RED = ("#FECACA", "#F87171", "#B91C1C")
SILVER = ("#F8FAFC", "#CBD5E1", "#64748B")
BRONZE = ("#FDE2C4", "#E0A060", "#8A4B1F")


def grad(gid, c, x1="0", y1="0", x2="0", y2="1"):
    return (f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="{c[0]}"/><stop offset="0.45" stop-color="{c[1]}"/>'
            f'<stop offset="1" stop-color="{c[2]}"/></linearGradient>')


def svg(name, defs, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
            f'<defs>{defs}</defs>{body}</svg>')


def gloss(p, d):
    """A soft top highlight over shape path d."""
    return f'<path d="{d}" fill="#FFFFFF" opacity="0.28"/>'


ART = {}


def add(path, defs, body):
    ART[path] = svg(path, defs, body)


# ---------------------------------------------------------------- currencies
# Diamond, XP and DP coin are NOT drawn here: the Rewards Center uses the
# app-wide currency icons (DiamondIcon, the XP star, CoinIcon), so the
# currencies look the same on every screen. diamond() / coin() are kept for
# reference only and are not called.
def diamond(path, c=CYAN, glow=False):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-a", c) + grad(f"{p}-b", (c[0], c[0], c[1]))
    body = ""
    if glow:
        defs += (f'<radialGradient id="{p}-g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{c[1]}" stop-opacity="0.75"/>'
                 f'<stop offset="1" stop-color="{c[1]}" stop-opacity="0"/></radialGradient>')
        body += f'<circle cx="32" cy="34" r="31" fill="url(#{p}-g)"/>'
    body += (f'<path d="M14 24 L22 12 H42 L50 24 L32 54 Z" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.6" stroke-linejoin="round"/>'
             f'<path d="M14 24 H50 L32 54 Z" fill="url(#{p}-a)" opacity="0.85"/>'
             f'<path d="M22 12 L27 24 L32 12 L37 24 L42 12" fill="none" stroke="{c[0]}" stroke-width="1.4" stroke-linejoin="round" opacity="0.9"/>'
             f'<path d="M27 24 L32 54 L37 24" fill="none" stroke="{c[0]}" stroke-width="1.2" opacity="0.7"/>'
             f'<path d="M14 24 H50" stroke="{c[0]}" stroke-width="1.4"/>'
             f'<path d="M22 12 H32 L27 24 H14 Z" fill="url(#{p}-b)" opacity="0.9"/>'
             f'<circle cx="46" cy="14" r="2.2" fill="#FFFFFF"/><path d="M46 8 V20 M40 14 H52" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>')
    add(path, defs, body)




def coin(path, c, label):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-a", c) + grad(f"{p}-b", (c[2], c[1], c[0]))
    body = (f'<circle cx="32" cy="34" r="25" fill="{c[2]}"/>'
            f'<circle cx="32" cy="31" r="25" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.6"/>'
            f'<circle cx="32" cy="31" r="18.5" fill="url(#{p}-b)" opacity="0.55"/>'
            f'<circle cx="32" cy="31" r="18.5" fill="none" stroke="{c[0]}" stroke-width="1.4"/>'
            f'<text x="32" y="38" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="{18 if len(label) < 3 else 14}" fill="#FFFFFF" stroke="{c[2]}" stroke-width="0.8">{label}</text>'
            f'<path d="M14 22 Q20 10 34 8" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.45"/>')
    add(path, defs, body)




def sparkle(path, c=GOLD):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-a", c)
    body = (f'<path d="M32 4 C34 22 42 30 60 32 C42 34 34 42 32 60 C30 42 22 34 4 32 C22 30 30 22 32 4 Z" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.2"/>'
            f'<circle cx="32" cy="32" r="4" fill="#FFFFFF"/>')
    add(path, defs, body)


sparkle("currencies/reward-sparkle.svg")


# ---------------------------------------------------------------- shared shapes
def crown(path, c=GOLD, gem=MAGENTA, wings=False):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-a", c) + grad(f"{p}-g", gem)
    body = ""
    if wings:
        body += (f'<path d="M12 40 C2 34 2 22 6 16 C10 26 16 30 20 32 Z" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.2"/>'
                 f'<path d="M52 40 C62 34 62 22 58 16 C54 26 48 30 44 32 Z" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.2"/>')
    body += (f'<path d="M12 46 L8 20 L22 32 L32 12 L42 32 L56 20 L52 46 Z" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.8" stroke-linejoin="round"/>'
             f'<rect x="11" y="44" width="42" height="8" rx="3" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="1.6"/>'
             f'<circle cx="8" cy="19" r="3.4" fill="url(#{p}-g)" stroke="{gem[2]}" stroke-width="1"/>'
             f'<circle cx="56" cy="19" r="3.4" fill="url(#{p}-g)" stroke="{gem[2]}" stroke-width="1"/>'
             f'<circle cx="32" cy="10" r="4" fill="url(#{p}-g)" stroke="{gem[2]}" stroke-width="1"/>'
             f'<path d="M32 30 L37 36 L32 42 L27 36 Z" fill="url(#{p}-g)" stroke="{gem[2]}" stroke-width="1"/>'
             f'<circle cx="20" cy="48" r="1.8" fill="{gem[1]}"/><circle cx="32" cy="48" r="1.8" fill="{CYAN[1]}"/><circle cx="44" cy="48" r="1.8" fill="{gem[1]}"/>'
             f'<path d="M14 40 L12 26" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.5"/>')
    add(path, defs, body)


def tile(p, c):
    """Rounded glossy tile used behind shortcut and mission glyphs."""
    return (f'<rect x="4" y="4" width="56" height="56" rx="16" fill="url(#{p}-t)" stroke="{c[2]}" stroke-width="1.6"/>'
            f'<path d="M8 20 Q8 8 20 8 H44 Q56 8 56 20 Q32 26 8 20 Z" fill="#FFFFFF" opacity="0.22"/>')


def glyph_icon(path, c, glyph, white=True):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-t", c)
    fill = "#FFFFFF" if white else c[2]
    add(path, defs, tile(p, c) + glyph.replace("FILL", fill).replace("DARK", c[2]))


G_CAL = ('<rect x="16" y="18" width="32" height="28" rx="5" fill="FILL"/><rect x="16" y="18" width="32" height="8" rx="4" fill="DARK" opacity="0.35"/>'
         '<rect x="22" y="14" width="3" height="8" rx="1.5" fill="FILL"/><rect x="39" y="14" width="3" height="8" rx="1.5" fill="FILL"/>'
         '<path d="M24 36 L30 41 L41 30" stroke="DARK" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
G_CLIP = ('<rect x="18" y="16" width="28" height="34" rx="5" fill="FILL"/><rect x="25" y="12" width="14" height="7" rx="3" fill="DARK"/>'
          '<path d="M24 30 L28 34 L35 26" stroke="DARK" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
          '<rect x="24" y="40" width="16" height="3" rx="1.5" fill="DARK" opacity="0.6"/>')
G_TROPHY = ('<path d="M22 16 H42 V28 C42 35 37 40 32 40 C27 40 22 35 22 28 Z" fill="FILL"/>'
            '<path d="M22 20 H15 C15 28 19 31 23 31" stroke="FILL" stroke-width="3" fill="none"/><path d="M42 20 H49 C49 28 45 31 41 31" stroke="FILL" stroke-width="3" fill="none"/>'
            '<rect x="29" y="40" width="6" height="6" fill="FILL"/><rect x="22" y="45" width="20" height="5" rx="2" fill="FILL"/>'
            '<path d="M32 21 L34 25 L38 25.5 L35 28.3 L35.8 32.5 L32 30.5 L28.2 32.5 L29 28.3 L26 25.5 L30 25 Z" fill="DARK"/>')
G_PEOPLE = ('<circle cx="25" cy="25" r="6.5" fill="FILL"/><path d="M13 47 C13 38 18 34 25 34 C32 34 37 38 37 47 Z" fill="FILL"/>'
            '<circle cx="41" cy="27" r="5.5" fill="FILL" opacity="0.85"/><path d="M34 47 C34 40 37 36 42 36 C48 36 51 40 51 47 Z" fill="FILL" opacity="0.85"/>')
G_PLAY = '<circle cx="32" cy="32" r="16" fill="FILL"/><path d="M28 24 L41 32 L28 40 Z" fill="DARK"/>'
G_SWAP = ('<path d="M16 26 H44 L38 20" stroke="FILL" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
          '<path d="M48 38 H20 L26 44" stroke="FILL" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
G_CLOCK = ('<circle cx="32" cy="32" r="16" fill="FILL"/><path d="M32 22 V32 L39 36" stroke="DARK" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
           '<path d="M14 22 A20 20 0 0 1 22 14" stroke="FILL" stroke-width="3" fill="none" stroke-linecap="round"/>')
G_GIFT = ('<rect x="15" y="28" width="34" height="20" rx="3" fill="FILL"/><rect x="13" y="21" width="38" height="9" rx="3" fill="FILL"/>'
          '<rect x="29.5" y="21" width="5" height="27" fill="DARK" opacity="0.7"/>'
          '<path d="M32 21 C26 12 18 15 22 20 C24 22 28 21 32 21 C36 21 40 22 42 20 C46 15 38 12 32 21 Z" fill="FILL" stroke="DARK" stroke-width="1"/>')
G_MEDAL = ('<path d="M24 12 H32 L28 26 Z" fill="FILL" opacity="0.8"/><path d="M40 12 H32 L36 26 Z" fill="FILL" opacity="0.8"/>'
           '<circle cx="32" cy="36" r="13" fill="FILL"/>'
           '<path d="M32 28 L34.3 32.7 L39.5 33.4 L35.7 37 L36.7 42.2 L32 39.7 L27.3 42.2 L28.3 37 L24.5 33.4 L29.7 32.7 Z" fill="DARK"/>')
G_PODIUM = ('<rect x="25" y="26" width="14" height="22" rx="2" fill="FILL"/><rect x="12" y="34" width="13" height="14" rx="2" fill="FILL" opacity="0.85"/>'
            '<rect x="39" y="38" width="13" height="10" rx="2" fill="FILL" opacity="0.75"/>'
            '<path d="M26 20 L28 14 L32 18 L36 14 L38 20 Z" fill="FILL"/><text x="32" y="42" text-anchor="middle" font-family="Arial" font-weight="900" font-size="11" fill="DARK">1</text>')
G_HEART = '<path d="M32 47 C18 38 13 31 13 24 C13 18 18 14 23 14 C27 14 30 16 32 19 C34 16 37 14 41 14 C46 14 51 18 51 24 C51 31 46 38 32 47 Z" fill="FILL"/>'
G_SHARE = ('<path d="M18 40 C20 28 28 22 38 22 V15 L50 26 L38 37 V30 C30 30 24 33 18 40 Z" fill="FILL" stroke="DARK" stroke-width="1" stroke-linejoin="round"/>')
G_FOLLOW = ('<circle cx="27" cy="25" r="7" fill="FILL"/><path d="M14 47 C14 38 20 34 27 34 C34 34 40 38 40 47 Z" fill="FILL"/>'
            '<rect x="42" y="23" width="4" height="14" rx="2" fill="FILL"/><rect x="37" y="28" width="14" height="4" rx="2" fill="FILL"/>')
G_VOTE = ('<rect x="16" y="20" width="32" height="26" rx="4" fill="FILL"/><path d="M24 33 L29 38 L40 27" stroke="DARK" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
          '<rect x="22" y="14" width="20" height="6" rx="2" fill="FILL" opacity="0.8"/>')
G_CHAT = '<path d="M14 18 H50 V40 H30 L20 48 V40 H14 Z" fill="FILL" stroke-linejoin="round"/><circle cx="24" cy="29" r="2.4" fill="DARK"/><circle cx="32" cy="29" r="2.4" fill="DARK"/><circle cx="40" cy="29" r="2.4" fill="DARK"/>'
G_CHECK = '<circle cx="32" cy="32" r="17" fill="FILL"/><path d="M23 32 L29.5 38.5 L42 26" stroke="DARK" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
G_STAR = '<path d="M32 13 L37.2 24 L49 25.6 L40.4 33.8 L42.6 45.6 L32 39.9 L21.4 45.6 L23.6 33.8 L15 25.6 L26.8 24 Z" fill="FILL" stroke="DARK" stroke-width="1"/>'
G_LEVEL = ('<path d="M32 12 L48 22 V42 L32 52 L16 42 V22 Z" fill="FILL"/><path d="M24 36 L32 27 L40 36" stroke="DARK" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
           '<path d="M26 42 H38" stroke="DARK" stroke-width="3" stroke-linecap="round"/>')

for name, c, g in [
    ("icons/check-in.svg", PURPLE, G_CAL),
    ("icons/daily-mission.svg", PURPLE, G_CLIP),
    ("icons/weekly-mission.svg", GOLD, G_TROPHY),
    ("icons/contest.svg", GOLD, G_TROPHY),
    ("icons/referral.svg", MAGENTA, G_PEOPLE),
    ("icons/watch-earn.svg", PURPLE, G_PLAY),
    ("icons/xp-convert.svg", PURPLE, G_SWAP),
    ("icons/achievement.svg", GOLD, G_MEDAL),
    ("icons/leaderboard.svg", GOLD, G_PODIUM),
    ("icons/reward-history.svg", ORANGE, G_CLOCK),
    ("icons/special-event.svg", MAGENTA, G_GIFT),
    ("missions/vote.svg", PURPLE, G_VOTE),
    ("missions/like.svg", MAGENTA, G_HEART),
    ("missions/share.svg", CYAN, G_SHARE),
    ("missions/follow.svg", PURPLE, G_FOLLOW),
    ("missions/comment.svg", GREEN, G_CHAT),
    ("missions/contest.svg", GOLD, G_TROPHY),
    ("missions/watch.svg", PURPLE, G_PLAY),
    ("missions/mission-complete.svg", GREEN, G_CHECK),
    ("rewards/participation.svg", PURPLE, G_MEDAL),
    ("rewards/runner-up.svg", SILVER, G_MEDAL),
    ("rewards/special-prize.svg", MAGENTA, G_STAR),
    ("achievements/social-star.svg", MAGENTA, G_STAR),
    ("achievements/voting-pro.svg", PURPLE, G_VOTE),
    ("achievements/contest-king.svg", GOLD, G_TROPHY),
    ("achievements/level-up.svg", CYAN, G_LEVEL),
    ("referral/invite-friends.svg", MAGENTA, G_PEOPLE),
    ("referral/referral-success.svg", GREEN, G_CHECK),
]:
    glyph_icon(name, c, g)

crown("branding/rewards-crown.svg")
crown("rewards/winner-crown.svg")
crown("events/event-crown.svg", gem=CYAN)
crown("leaderboard/top-earner-crown.svg", wings=True)
crown("badges/level-wings.svg", wings=True, gem=PURPLE)


# ---------------------------------------------------------------- streak art
def fire(path):
    p = "streak-fire"
    defs = grad(f"{p}-a", ("#FFF7AE", "#FB923C", "#DC2626")) + grad(f"{p}-b", ("#FFFFFF", "#FDE047", "#F97316"))
    body = ('<path d="M32 60 C16 60 10 48 12 38 C14 28 22 24 22 14 C30 18 34 26 33 32 C37 28 38 22 37 16 C48 24 54 34 52 44 C50 54 42 60 32 60 Z" '
            f'fill="url(#{p}-a)" stroke="#991B1B" stroke-width="1.4"/>'
            f'<path d="M32 58 C24 58 21 51 22 46 C23 41 27 39 28 33 C33 37 34 42 33 45 C36 43 38 40 38 37 C43 42 44 47 42 51 C40 56 36 58 32 58 Z" fill="url(#{p}-b)"/>')
    add(path, defs, body)


fire("streak/streak-fire.svg")


def gift(path, box=PURPLE, ribbon=GOLD):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-a", box) + grad(f"{p}-r", ribbon)
    body = (f'<rect x="10" y="30" width="44" height="28" rx="4" fill="url(#{p}-a)" stroke="{box[2]}" stroke-width="1.6"/>'
            f'<rect x="7" y="21" width="50" height="12" rx="4" fill="url(#{p}-a)" stroke="{box[2]}" stroke-width="1.6"/>'
            f'<rect x="28" y="21" width="8" height="37" fill="url(#{p}-r)" stroke="{ribbon[2]}" stroke-width="1"/>'
            f'<path d="M32 21 C24 8 12 10 16 18 C18 22 26 21 32 21 C38 21 46 22 48 18 C52 10 40 8 32 21 Z" fill="url(#{p}-r)" stroke="{ribbon[2]}" stroke-width="1.2"/>'
            '<path d="M11 26 H53" stroke="#FFFFFF" stroke-width="2" opacity="0.35"/>')
    add(path, defs, body)


gift("streak/gift-box.svg")
gift("referral/referral-gift.svg", box=MAGENTA)


def chest(path):
    p = "streak-chest"
    defs = grad(f"{p}-w", ("#FDBA74", "#B45309", "#78350F")) + grad(f"{p}-g", GOLD) + grad(f"{p}-l", PURPLE)
    body = (f'<path d="M8 30 H56 V54 Q56 58 52 58 H12 Q8 58 8 54 Z" fill="url(#{p}-w)" stroke="#451A03" stroke-width="1.6"/>'
            f'<path d="M8 30 C8 16 18 10 32 10 C46 10 56 16 56 30 Z" fill="url(#{p}-l)" stroke="#3B0764" stroke-width="1.6"/>'
            f'<rect x="6" y="28" width="52" height="6" rx="2" fill="url(#{p}-g)" stroke="#92400E" stroke-width="1"/>'
            f'<rect x="28" y="10" width="8" height="48" fill="url(#{p}-g)" opacity="0.9"/>'
            f'<rect x="26" y="32" width="12" height="12" rx="3" fill="url(#{p}-g)" stroke="#92400E" stroke-width="1.2"/>'
            '<circle cx="32" cy="38" r="2" fill="#78350F"/>'
            f'<path d="M14 22 Q20 14 30 13" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.4"/>')
    add(path, defs, body)


chest("streak/reward-chest.svg")


def day_check(path):
    p = "streak-day-check"
    defs = grad(f"{p}-a", PURPLE)
    body = (f'<rect x="6" y="6" width="52" height="52" rx="14" fill="url(#{p}-a)" stroke="#E879F9" stroke-width="2"/>'
            '<circle cx="32" cy="32" r="15" fill="#FFFFFF" opacity="0.95"/>'
            '<path d="M24.5 32.5 L30 38 L40.5 27" stroke="#7C3AED" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    add(path, defs, body)


day_check("streak/day-check.svg")


# ---------------------------------------------------------------- leaderboard
def rank(path, n, c):
    p = path.replace("/", "-").replace(".svg", "")
    defs = grad(f"{p}-a", c)
    body = (f'<path d="M20 8 H28 L24 24 Z" fill="{MAGENTA[1]}"/><path d="M44 8 H36 L40 24 Z" fill="{PURPLE[1]}"/>'
            f'<circle cx="32" cy="38" r="20" fill="url(#{p}-a)" stroke="{c[2]}" stroke-width="2"/>'
            f'<circle cx="32" cy="38" r="14" fill="none" stroke="{c[0]}" stroke-width="1.6"/>'
            f'<text x="32" y="45" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="19" fill="#FFFFFF" stroke="{c[2]}" stroke-width="0.8">{n}</text>')
    add(path, defs, body)


rank("leaderboard/rank-1.svg", 1, GOLD)
rank("leaderboard/rank-2.svg", 2, SILVER)
rank("leaderboard/rank-3.svg", 3, BRONZE)


# ---------------------------------------------------------------- watch & earn / events
def video_reward(path):
    p = "illu-video"
    defs = grad(f"{p}-a", PURPLE) + grad(f"{p}-c", MAGENTA) + grad(f"{p}-d", CYAN)
    body = (f'<rect x="6" y="14" width="44" height="34" rx="6" fill="url(#{p}-a)" stroke="#3B0764" stroke-width="1.6" transform="rotate(-8 28 31)"/>'
            f'<path d="M6 18 L46 12 L47 20 L7 26 Z" fill="url(#{p}-c)" opacity="0.9"/>'
            '<path d="M22 26 L38 33 L22 41 Z" fill="#FFFFFF" transform="rotate(-8 28 31)"/>'
            f'<path d="M44 44 L49 36 H57 L62 44 L52.5 58 Z" fill="url(#{p}-d)" stroke="#1E3A8A" stroke-width="1.2" stroke-linejoin="round"/>'
            f'<path d="M30 52 L33 47 H38 L41 52 L35.5 60 Z" fill="url(#{p}-d)" stroke="#1E3A8A" stroke-width="1" stroke-linejoin="round"/>')
    add(path, defs, body)


video_reward("illustrations/watch-earn.svg")


def event_gift(path):
    p = "event-gift"
    defs = grad(f"{p}-a", MAGENTA) + grad(f"{p}-r", GOLD) + grad(f"{p}-c", GOLD)
    body = (f'<rect x="10" y="32" width="44" height="26" rx="4" fill="url(#{p}-a)" stroke="#831843" stroke-width="1.6"/>'
            f'<rect x="7" y="24" width="50" height="11" rx="4" fill="url(#{p}-a)" stroke="#831843" stroke-width="1.6"/>'
            f'<rect x="28" y="24" width="8" height="34" fill="url(#{p}-r)"/>'
            f'<path d="M18 22 L16 8 L24 14 L32 4 L40 14 L48 8 L46 22 Z" fill="url(#{p}-c)" stroke="#B45309" stroke-width="1.4" stroke-linejoin="round"/>'
            '<circle cx="32" cy="15" r="2.6" fill="#22D3EE"/>'
            '<circle cx="8" cy="14" r="1.8" fill="#FFF"/><circle cx="58" cy="20" r="1.4" fill="#FFF"/><circle cx="54" cy="6" r="1.8" fill="#FDE047"/>')
    add(path, defs, body)


event_gift("events/event-gift-box.svg")


# ---------------------------------------------------------------- lottie
def lottie_burst():
    """Diamond-claim burst: a ring of sparks flying out and fading, 1s at 60fps."""
    colors = [[0.13, 0.83, 0.93, 1], [0.93, 0.29, 0.6, 1], [1, 0.84, 0.29, 1], [0.66, 0.33, 0.97, 1]]
    layers = []
    import math
    for i in range(12):
        a = i * math.pi * 2 / 12
        dx, dy = math.cos(a) * 80, math.sin(a) * 80
        c = colors[i % 4]
        layers.append({
            "ddd": 0, "ind": i + 1, "ty": 4, "nm": f"spark{i}", "sr": 1, "ip": 0, "op": 60, "st": 0, "bm": 0,
            "ks": {
                "o": {"a": 1, "k": [{"t": 0, "s": [100], "o": {"x": [0.3], "y": [0]}, "i": {"x": [0.7], "y": [1]}}, {"t": 60, "s": [0]}]},
                "r": {"a": 0, "k": 0},
                "p": {"a": 1, "k": [{"t": 0, "s": [100, 100, 0], "o": {"x": 0.2, "y": 0}, "i": {"x": 0.3, "y": 1}}, {"t": 45, "s": [100 + dx, 100 + dy, 0]}]},
                "a": {"a": 0, "k": [0, 0, 0]},
                "s": {"a": 1, "k": [{"t": 0, "s": [40, 40, 100], "o": {"x": [0.3], "y": [0]}, "i": {"x": [0.7], "y": [1]}}, {"t": 15, "s": [120, 120, 100]}, {"t": 60, "s": [30, 30, 100]}]},
            },
            "shapes": [{"ty": "gr", "it": [
                {"ty": "sr", "sy": 1, "d": 1, "pt": {"a": 0, "k": 4}, "p": {"a": 0, "k": [0, 0]}, "r": {"a": 0, "k": 45},
                 "ir": {"a": 0, "k": 3}, "is": {"a": 0, "k": 0}, "or": {"a": 0, "k": 10}, "os": {"a": 0, "k": 0}},
                {"ty": "fl", "c": {"a": 0, "k": c}, "o": {"a": 0, "k": 100}, "r": 1},
                {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}},
            ]}],
        })
    ring = {
        "ddd": 0, "ind": 13, "ty": 4, "nm": "ring", "sr": 1, "ip": 0, "op": 40, "st": 0, "bm": 0,
        "ks": {"o": {"a": 1, "k": [{"t": 0, "s": [90]}, {"t": 40, "s": [0]}]}, "r": {"a": 0, "k": 0}, "p": {"a": 0, "k": [100, 100, 0]},
               "a": {"a": 0, "k": [0, 0, 0]}, "s": {"a": 1, "k": [{"t": 0, "s": [20, 20, 100], "o": {"x": [0.2], "y": [0]}, "i": {"x": [0.3], "y": [1]}}, {"t": 40, "s": [180, 180, 100]}]}},
        "shapes": [{"ty": "gr", "it": [
            {"ty": "el", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [80, 80]}},
            {"ty": "st", "c": {"a": 0, "k": [1, 0.84, 0.29, 1]}, "o": {"a": 0, "k": 100}, "w": {"a": 0, "k": 4}, "lc": 2, "lj": 2},
            {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}},
        ]}],
    }
    return {"v": "5.7.4", "fr": 60, "ip": 0, "op": 60, "w": 200, "h": 200, "nm": "diamond-claim", "ddd": 0, "assets": [], "layers": [ring] + layers}


def main():
    for rel, content in ART.items():
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w") as f:
            f.write(content + "\n")
    anim = os.path.join(ANIM_ROOT, "animations")
    os.makedirs(anim, exist_ok=True)
    with open(os.path.join(anim, "diamond-claim.json"), "w") as f:
        json.dump(lottie_burst(), f, separators=(",", ":"))
    print(f"wrote {len(ART)} svg to {os.path.relpath(ROOT)} + 1 lottie to {os.path.relpath(anim)}")


if __name__ == "__main__":
    main()
