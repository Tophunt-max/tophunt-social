/**
 * Rewards Center artwork registry. Every piece the app ships is a transparent
 * WebP in this folder (256 px, illustrations 384 px), rendered from the SVG
 * sources in apps/expo/design/earning by scripts/gen-earning-webp.mjs, which
 * adds the raster finish (glow, drop shadow, sheen) that SVG can't carry on
 * every platform. Screens use `EARNING_ART[key]` through the `Art` component,
 * never a path.
 *
 * Admins can replace any piece without an app update: Earning Management →
 * Assets uploads a WebP / PNG for a key (appConfig.earningAssets), and `Art`
 * draws it instead (falling back to the bundled WebP if it fails to load).
 * Keys and files here must match the Worker list in
 * apps/worker/src/lib/earningAssets.ts; test/earningAssets.test.ts checks
 * both, that every key resolves, and that every file is a valid WebP.
 */
import type { ImageSourcePropType } from 'react-native';

const Sparkle: ImageSourcePropType = require('./currencies/reward-sparkle.webp');

const RewardsCrown: ImageSourcePropType = require('./branding/rewards-crown.webp');
const LevelWings: ImageSourcePropType = require('./badges/level-wings.webp');

const IconCheckIn: ImageSourcePropType = require('./icons/check-in.webp');
const IconDailyMission: ImageSourcePropType = require('./icons/daily-mission.webp');
const IconWeeklyMission: ImageSourcePropType = require('./icons/weekly-mission.webp');
const IconContest: ImageSourcePropType = require('./icons/contest.webp');
const IconReferral: ImageSourcePropType = require('./icons/referral.webp');
const IconWatchEarn: ImageSourcePropType = require('./icons/watch-earn.webp');
const IconXpConvert: ImageSourcePropType = require('./icons/xp-convert.webp');
const IconAchievement: ImageSourcePropType = require('./icons/achievement.webp');
const IconLeaderboard: ImageSourcePropType = require('./icons/leaderboard.webp');
const IconRewardHistory: ImageSourcePropType = require('./icons/reward-history.webp');
const IconSpecialEvent: ImageSourcePropType = require('./icons/special-event.webp');

const StreakFire: ImageSourcePropType = require('./streak/streak-fire.webp');
const GiftBox: ImageSourcePropType = require('./streak/gift-box.webp');
const RewardChest: ImageSourcePropType = require('./streak/reward-chest.webp');
const DayCheck: ImageSourcePropType = require('./streak/day-check.webp');

const MissionVote: ImageSourcePropType = require('./missions/vote.webp');
const MissionLike: ImageSourcePropType = require('./missions/like.webp');
const MissionShare: ImageSourcePropType = require('./missions/share.webp');
const MissionFollow: ImageSourcePropType = require('./missions/follow.webp');
const MissionComment: ImageSourcePropType = require('./missions/comment.webp');
const MissionContest: ImageSourcePropType = require('./missions/contest.webp');
const MissionWatch: ImageSourcePropType = require('./missions/watch.webp');
const MissionComplete: ImageSourcePropType = require('./missions/mission-complete.webp');

const Participation: ImageSourcePropType = require('./rewards/participation.webp');
const WinnerCrown: ImageSourcePropType = require('./rewards/winner-crown.webp');
const RunnerUp: ImageSourcePropType = require('./rewards/runner-up.webp');
const SpecialPrize: ImageSourcePropType = require('./rewards/special-prize.webp');

const InviteFriends: ImageSourcePropType = require('./referral/invite-friends.webp');
const ReferralGift: ImageSourcePropType = require('./referral/referral-gift.webp');
const ReferralSuccess: ImageSourcePropType = require('./referral/referral-success.webp');

const SocialStar: ImageSourcePropType = require('./achievements/social-star.webp');
const VotingPro: ImageSourcePropType = require('./achievements/voting-pro.webp');
const ContestKing: ImageSourcePropType = require('./achievements/contest-king.webp');
const LevelUp: ImageSourcePropType = require('./achievements/level-up.webp');

const EventGiftBox: ImageSourcePropType = require('./events/event-gift-box.webp');
const EventCrown: ImageSourcePropType = require('./events/event-crown.webp');

const Rank1: ImageSourcePropType = require('./leaderboard/rank-1.webp');
const Rank2: ImageSourcePropType = require('./leaderboard/rank-2.webp');
const Rank3: ImageSourcePropType = require('./leaderboard/rank-3.webp');
const TopEarnerCrown: ImageSourcePropType = require('./leaderboard/top-earner-crown.webp');

const WatchEarnIllustration: ImageSourcePropType = require('./illustrations/watch-earn.webp');

export const EARNING_ART = {
  sparkle: Sparkle,
  rewardsCrown: RewardsCrown,
  levelWings: LevelWings,
  checkIn: IconCheckIn,
  dailyMission: IconDailyMission,
  weeklyMission: IconWeeklyMission,
  contest: IconContest,
  referral: IconReferral,
  watchEarn: IconWatchEarn,
  xpConvert: IconXpConvert,
  achievement: IconAchievement,
  leaderboard: IconLeaderboard,
  rewardHistory: IconRewardHistory,
  specialEvent: IconSpecialEvent,
  streakFire: StreakFire,
  giftBox: GiftBox,
  rewardChest: RewardChest,
  dayCheck: DayCheck,
  missionVote: MissionVote,
  missionLike: MissionLike,
  missionShare: MissionShare,
  missionFollow: MissionFollow,
  missionComment: MissionComment,
  missionContest: MissionContest,
  missionWatch: MissionWatch,
  missionComplete: MissionComplete,
  participation: Participation,
  winnerCrown: WinnerCrown,
  runnerUp: RunnerUp,
  specialPrize: SpecialPrize,
  inviteFriends: InviteFriends,
  referralGift: ReferralGift,
  referralSuccess: ReferralSuccess,
  socialStar: SocialStar,
  votingPro: VotingPro,
  contestKing: ContestKing,
  levelUp: LevelUp,
  eventGiftBox: EventGiftBox,
  eventCrown: EventCrown,
  rank1: Rank1,
  rank2: Rank2,
  rank3: Rank3,
  topEarnerCrown: TopEarnerCrown,
  watchEarnIllustration: WatchEarnIllustration,
} satisfies Record<string, ImageSourcePropType>;

/**
 * Currency slots. Not artwork files and not replaceable from the admin panel:
 * `Art` draws the app-wide icons for them (DiamondIcon, XpIcon,
 * CoinIcon), the same ones the wallet, contests and shop use.
 */
export const CURRENCY_ART = ['diamond', 'diamondGlow', 'xp', 'dpCoin'] as const;
export type CurrencyArtKey = (typeof CURRENCY_ART)[number];

/** Bundled artwork keys (replaceable from Earning Management → Assets). */
export type BundledArtKey = keyof typeof EARNING_ART;
/** Every key `Art` can draw. */
export type EarningArtKey = BundledArtKey | CurrencyArtKey;

/** Claim-burst Lottie (native). Web draws SparkleBurst instead. */
export const EARNING_ANIMATIONS = {
  diamondClaim: require('./animations/diamond-claim.json'),
};

/** Mission art per daily-task / quest type (server `type` / `metric`). */
export const MISSION_ART: Record<string, EarningArtKey> = {
  vote: 'missionVote',
  votes: 'missionVote',
  like: 'missionLike',
  share: 'missionShare',
  follow: 'missionFollow',
  comment: 'missionComment',
  contest: 'missionContest',
  entries: 'missionContest',
  wins: 'missionContest',
  ads: 'missionWatch',
  checkins: 'checkIn',
  active_days: 'checkIn',
  xp: 'levelUp',
};
