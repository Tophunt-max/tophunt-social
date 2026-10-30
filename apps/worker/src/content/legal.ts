/**
 * Bundled legal documents.
 *
 * ## Why these live in code
 *
 * Legal copy used to exist only as four strings inside `settings/appConfig`,
 * written by hand in the admin panel. If nobody had typed them, `/read/app-config`
 * returned `""` and the app rendered "Our terms of service has not been published
 * yet." — which is what tophunt.in/legal/terms, /legal/privacy and /legal/refund
 * were actually serving in production.
 *
 * That is not a content problem, it is a structural one: the documents that are
 * legally REQUIRED to exist (both app stores require a privacy policy and terms)
 * were stored in the one place
 * that defaults to empty and is not covered by code review, tests, backups or
 * rollback. An empty policy is also a documented app-store rejection reason.
 *
 * So the canonical text ships with the Worker. It cannot be empty, it is
 * versioned in git, and a bad edit is revertable. Admin content still wins when
 * present (see `resolveLegalContent`), so operations keeps the ability to publish
 * a change without a deploy — it just can no longer publish *nothing*.
 *
 * ## Accuracy over boilerplate
 *
 * These are written against what this codebase actually does, not from a
 * template. Specifically:
 *
 *   - 18+ only, because `MINIMUM_AGE` in signup/fill-profile enforces it.
 *   - No real money: Diamonds are earned free (rewards, XP conversion) and pay
 *     contest entry fees; prizes are DP coins, spent only in Shopping (gifts,
 *     digital items, physical products). Nothing is bought or cashed out.
 *   - The retention list in the privacy policy is copied from the one in
 *     `lib/accountDeletion.ts`, which is the code that actually decides what
 *     survives a deletion. If that list changes, this one must change with it.
 *
 * `{{SUPPORT_EMAIL}}` is interpolated at serve time from `appConfig.supportEmail`
 * so the contact address is never stale or duplicated.
 *
 * NOTE FOR OPERATIONS: this is an accurate description of the product's current
 * behaviour, and is the right baseline to have live rather than nothing. Have
 * counsel review it before an app-store submission, and fill in the registered
 * entity name and address where marked in the Contact sections.
 */

/** The four documents the app renders. Mirrors `LegalDocKey` in the Expo app. */
export interface LegalContent {
  privacyPolicy: string;
  termsOfService: string;
  refundPolicy: string;
  communityGuidelines: string;
}

export type LegalDocKey = keyof LegalContent;

export const LEGAL_DOC_KEYS: readonly LegalDocKey[] = [
  "privacyPolicy",
  "termsOfService",
  "refundPolicy",
  "communityGuidelines",
] as const;

/** Human labels + why each document exists, for the admin editor. */
export const LEGAL_DOC_META: Record<LegalDocKey, { label: string; note: string }> = {
  privacyPolicy: { label: "Privacy Policy", note: "Required by both app stores." },
  termsOfService: { label: "Terms of Service", note: "Include contest rules and eligibility." },
  refundPolicy: {
    label: "Refund & Cancellation Policy",
    note: "Contest entries, Diamonds and shop orders.",
  },
  communityGuidelines: {
    label: "Community Guidelines",
    note: "Referenced from the in-app report flow.",
  },
};

/**
 * Bump this whenever the substance of a document below changes.
 *
 * It is rendered as "Last updated" on each screen, so it must be edited in the
 * same commit as the text — a policy showing a date older than its own content is
 * worse than showing no date, because it invites the reader to assume nothing has
 * changed.
 */
export const LEGAL_LAST_UPDATED = "30 October 2026";

import { parseGraceDays } from "../lib/accountStatus";

const FALLBACK_SUPPORT_EMAIL = "support@tophunt.in";

const TERMS_OF_SERVICE = `**Last updated: ${LEGAL_LAST_UPDATED}**

These terms are the agreement between you and TopHunt ("TopHunt", "we", "us"). They cover the TopHunt app and tophunt.in. By creating an account or entering a contest you accept them. If you do not accept them, do not use TopHunt.

## 1. Who may use TopHunt

You must be at least 18 years old. There is no under-18 tier and no parental-consent route — we will close an account if we learn its holder is a minor.

One person, one account. Additional accounts, accounts registered on someone else's identity documents, and accounts operated by software are all prohibited.

## 2. Your account

You give us accurate registration details and keep them accurate. Your date of birth, phone number and email are used to verify eligibility and to deliver shop orders and prizes, so wrong details can block a reward or a delivery.

You are responsible for what happens under your login, including anything done by someone you let use your device. Tell us at {{SUPPORT_EMAIL}} immediately if you think someone else has access to your account.

We may suspend or close an account that breaks these terms, the Community Guidelines, or the law. Where the reason is not fraud or a legal obligation, we will tell you why.

## 3. Contests

**How contests work.** A contest is a head-to-head or multi-entrant comparison of user-submitted photos or videos, decided by votes from other users, within a fixed window. Some contests are free; some require an entry fee in Diamonds. Every contest states its fee, prize and closing time before you join.

**Outcomes are decided by votes and by skill.** Prizes reflect how your entry performs against other entries — its subject, composition, effort and appeal. TopHunt is not a game of chance and there is no wagering on an outside event.

**Entering is final.** Once you have joined a contest your entry fee is committed and cannot be returned, because your opponent's contest now depends on your entry existing. See the Refund Policy for the narrow exceptions.

**Fair play.** The following void an entry and forfeit its fee:

- Voting for your own entry through any other account.
- Buying, selling, exchanging or organising votes, including vote-for-vote arrangements.
- Using bots, scripts, emulators, automation or multiple devices to influence a result.
- Coordinating with another entrant to fix an outcome.
- Entering media you did not create or do not have the rights to.
- Interfering with another user's ability to take part.

We detect these through device signals, voting patterns and account relationships. Where we void an entry we will say so in writing and, where the result of a contest has already been paid out, we may reverse the credit.

**Results.** A result is final once the contest closes and the prize is credited. If you believe a result is wrong, write to {{SUPPORT_EMAIL}} within 7 days of the close and we will re-examine the entries and the vote log.

## 4. Diamonds, DP coins and prizes

**Two in-app balances.** Your wallet holds **Diamonds** and **DP coins**. Neither is money, a stored-value instrument or a security, and neither earns interest. They exist only inside TopHunt. **You never pay money in TopHunt, and coins are never paid out as money.**

- **Diamonds** are free. You earn them from rewards (account verification, daily check-in and tasks, referrals, rewarded ads where enabled, the monthly Hall of Fame) and by converting XP. They pay contest entry fees and nothing else, and cannot be bought, sold, transferred or exchanged for money.
- **DP coins** are what you win. They come from contest prizes and are spent only in TopHunt Shopping: virtual gifts, digital items and physical products. They cannot be bought, transferred or exchanged for money.

**Rewards are promotional.** We may change or end any reward, and daily and monthly limits apply. We may reverse a reward obtained by abusing the mechanism — for example several accounts on one device, or a fake verification.

**Entry fees and prizes.** Contest entry fees are paid in Diamonds and deducted immediately. A refunded entry fee comes back as Diamonds. A contest prize is paid in DP coins; above a monthly limit, part of a prize may be paid as Diamonds, as the app shows. A share of each paid contest's entry Diamonds may be kept as a platform fee; the prize shown before you join is the prize you can win.

**Shopping.** Prices are shown in DP coins. Physical orders are subject to stock, fraud checks, delivery to an address in India, and the cancellation and return rules in the Refund Policy.

## 5. Your content

You keep ownership of the photos and videos you upload. You give us a worldwide, royalty-free licence to host, resize, transcode, cache, display and distribute them for the purpose of operating and promoting TopHunt, including in a contest feed, a leaderboard and, where you are a winner, in promotional material about that contest. This licence lasts as long as the content is on TopHunt, and survives afterwards only for copies already distributed and for the records described in the Privacy Policy.

You confirm that you own or are licensed to use everything you upload, that everyone recognisable in it has agreed to appear, and that it does not break the Community Guidelines.

We may remove content that breaks the Guidelines or the law, and we may do so without notice where it is illegal or harmful. Repeatedly uploading infringing content will close your account.

If you believe content on TopHunt infringes your copyright, write to {{SUPPORT_EMAIL}} identifying the work, the location of the copy, and your authority to act. We will remove or disable it while we investigate.

## 6. What you may not do

- Break the law, or help anyone else to.
- Impersonate anyone, including us.
- Upload malware, or probe, scrape, overload or reverse-engineer any part of the service.
- Use an automated client, a modified build of the app, or an emulator to take part in contests.
- Extract our data in bulk, or use TopHunt content to train a model without our written permission.
- Resell or sublicense access to TopHunt.

## 7. Availability and change

We change TopHunt continuously. Features arrive, change and are withdrawn. We may require a minimum app version, and we may take the service down for maintenance. We aim to give notice of anything that affects a balance or an open contest, and we will always let an open contest finish or refund its fee if we cannot.

We do not promise uninterrupted service. TopHunt depends on networks, app stores, couriers and cloud infrastructure we do not control.

## 8. Ending the agreement

You can stop using TopHunt at any time and delete your account from Settings. Deletion is permanent, it is blocked while you have a contest in progress, and any remaining DP coin and Diamond balance is forfeited — so spend your DP coins first. What survives deletion is set out in the Privacy Policy.

We may end your access if you break these terms. Sections that should outlive the agreement — content licences already granted, liability, financial records, and dispute resolution — do.

## 9. Liability

TopHunt is provided as it is. To the extent the law allows, we exclude implied warranties.

We are not liable for indirect or consequential loss, for lost profits, or for loss of goodwill or opportunity. Where we are liable, our total liability to you is capped at ₹5,000.

Nothing here excludes liability that cannot lawfully be excluded, including for fraud, or for death or personal injury caused by negligence.

## 10. Disputes

Please write to {{SUPPORT_EMAIL}} first — nearly everything is resolved there, and it is faster than any alternative.

These terms are governed by the law of India. The courts of India have jurisdiction, and you and we submit to them.

## 11. Changes to these terms

We may update these terms. When a change materially affects your rights, your balance or the cost of taking part, we will notify you in the app before it takes effect. Continuing to use TopHunt after that point means you accept the updated terms. Every version carries the date it was published at the top.

## 12. Contact

Write to {{SUPPORT_EMAIL}}.

Registered entity name and address: available on request from the address above, and stated in full on our published grievance page.`;

const PRIVACY_POLICY = `**Last updated: ${LEGAL_LAST_UPDATED}**

This policy explains what TopHunt collects about you, why, who else sees it, and what you can do about it. It describes the app and tophunt.in.

The short version: we collect what is needed to run an account, judge contests fairly and deliver what you win or order. We do not sell your personal information.

## 1. What we collect

**What you give us when you sign up.** Name, username, email address, phone number, date of birth, and a profile photo. We ask for date of birth because TopHunt is 18+ and we have to be able to show we checked. We ask for phone and email because they are how we verify it is you and how we reach you about your rewards and orders.

**Optional profile details.** Bio, occupation, gender, and links to your Facebook, X or Instagram profiles. These are optional and, apart from gender and occupation, publicly visible.

**What you create.** The photos and videos you enter into contests, your posts, stories, comments, likes, votes, and who you follow.

**Contest and wallet activity.** Contests you joined, entry fees, results, DP coin and Diamond credits and debits, and your shop orders including the delivery name, phone number and address you give us for them. We never ask for card, UPI or bank details: nothing in TopHunt is paid for with money.

**Technical and device data.** IP address, device model, operating system, app version, crash reports, and a push-notification token if you allow notifications. We also record coarse device identifiers used to detect the same person running several accounts — the fair-play rules in the Terms depend on this, and a contest cannot be fair without it.

**Approximate location.** Where you allow it, coordinates used for region-specific contests and for eligibility. We do not track your movements.

**Support correspondence.** Problem reports, tickets and the diagnostic details you attach.

We do not collect your contacts, your calendar, or your messages in other apps.

## 2. Why we use it

- **To run your account** — sign-in, profile, followers, notifications.
- **To run contests** — matching entries, counting votes, deciding results, showing leaderboards.
- **To keep contests fair** — detecting duplicate accounts, vote manipulation, bots and collusion. This is the purpose most likely to result in an account being restricted, so it is worth naming plainly.
- **To credit rewards and deliver orders** — Diamond rewards, prize credits, shop orders and their delivery.
- **To keep the service safe** — moderating content, acting on reports, blocking abuse.
- **To support you** — answering what you write to us.
- **To improve TopHunt** — aggregate usage and crash data. We do not need to know who you are to fix a crash, and we do not look. The app also sends anonymous counts (for example how many stories are watched to the end, how often a video buffers, whether a search found anything) with no account, device or content identifier attached; you can turn this off in Settings › Privacy.
- **To meet legal obligations** — accounting, tax, and lawful requests from authorities.

We rely on performing our contract with you for most of this, on our legitimate interest in a fair and safe platform for anti-fraud and moderation, on your consent for location and push notifications, and on legal obligation for financial records.

## 3. What other people can see

**Public:** your username, name, profile photo, bio, social links, contest entries, posts, stories, wins, follower and following counts, and your position on public leaderboards.

**Not public:** your email address, phone number, date of birth, exact DP coin and Diamond balances, transactions, delivery addresses, location, device data, and anything you send to support.

**A private account** limits your entries and stories to people you approve, and takes you out of public discovery surfaces. It does not retroactively hide a contest you already entered — the other entrant's result depends on it being visible.

**Who has blocked you is never disclosed**, to you or to anyone. Our API does not return it in either direction beyond your own outgoing list.

## 4. Who we share it with

We share personal data only with providers who process it for us under contract, and only what each needs:

- **Google Firebase** — authentication and push notifications.
- **Cloudflare** — application hosting, database, media storage and delivery.
- **Qencode** — video transcoding.
- **Courier partners** — the delivery name, phone number and address of a physical shop order or prize.
- **An SMS and an email provider** — one-time codes and account email.

We also disclose data where the law requires it, to respond to a valid legal request, to enforce our Terms, or to protect someone's safety. If TopHunt is ever sold or merged, account data moves with it and we will tell you before it does.

**We do not sell your personal information, and we do not share it with advertisers for their own use.**

Some of these providers operate outside India. Where data crosses a border it stays under contractual protection at least as strong as this policy.

## 5. How long we keep it

While your account is open, we keep your data for as long as it is useful for the purposes above.

When you ask us to delete your account, it closes immediately: nobody can find you, view your profile or see your posts from that moment on. Your data is then permanently erased after a grace period of {{DELETION_GRACE_DAYS}} days. If you change your mind, sign in before that date and choose to keep your account — everything comes back. Once the grace period ends, erasure cannot be undone.

Erasure deletes your own content: profile, photo, bio, contact details, posts, stories, comments (including comments on our blog), likes, reactions, saved items, highlights, followers and who you follow, notifications, support tickets, blocks and mutes, and your login. Photos and videos are removed from storage, including videos you uploaded but never published.

**What survives erasure, and why:**

- **Coin transactions (DP coin and Diamond, including reward and prize-subsidy records) and shop orders** — the accounting record of every balance and delivery. They stay keyed to an identifier that is no longer linked to your name, email or phone.
- **Votes and contests you took part in** — other entrants' results are computed from them. Removing your votes would silently change someone else's outcome. The contest record survives, but your name, photo and contest entry image are removed from it.
- **Referral records** — the person who referred you, or whom you referred, earned a bonus that has to stay explainable.
- **Reports you filed** — these are evidence about someone else's conduct, and are kept for moderation.
- **Conversations you were part of** — the messages you sent are deleted and your name and photo are replaced, but the other person keeps their side of the conversation.
- **Administrative audit records** — the log of actions our own staff took.
- **Prize records** — that a prize was awarded, and whether it was delivered, is an accounting record. The record survives; your delivery name, phone number and full address are erased from it.
- **Monthly Hall of Fame results** — that an account placed in a month's top three, and what it was paid, is an accounting record. It is also what stops that month's prize being paid out twice.
- **XP history, season results and review flags** — the record of XP earned and corrected, final season rankings, and any activity flagged for staff review. They are kept so a correction or an appeal can be checked and a season's rewards cannot be paid twice. Your achievements, cosmetics and unclaimed rewards are deleted.
- **Verification bonus fingerprints** — if your email address and mobile number earned the verification bonus, a one-way fingerprint (hash) of each is kept so the same email or number cannot claim the bonus again on a new account. It cannot be turned back into your email or number.

None of these remain linked to your identity. Retained financial records are kept for the period Indian tax and accounting law requires, and then deleted.

If you are in a contest that has not finished, or a prize or shop order is still on its way to you, we still accept your deletion request and close your account straight away — we simply wait for that one thing to settle before erasing the data, because someone else's result or your own parcel depends on it. You are never asked to come back and try again later.

## 6. Your rights

You can:

- **See and correct** your data — most of it directly in Edit Profile.
- **Delete your account** — Settings, then Delete Account. Available at any time, including if your account has been blocked.
- **Get a copy** of your data — tap "Download a copy of my data" on the Delete Account screen, or write to {{SUPPORT_EMAIL}}.
- **Withdraw consent** for location or notifications — in your device settings, at any time.
- **Object to or restrict** a use we base on legitimate interest — write to us and we will consider it and reply.
- **Complain** — to us first at {{SUPPORT_EMAIL}}, and to your data protection authority if we do not resolve it.

We answer rights requests within 30 days. We will ask you to confirm who you are first, because acting on an impersonated request would be the worse failure.

## 7. Security

Data is encrypted in transit. Passwords are handled by Firebase Authentication and are never stored by us in a readable form. Payment credentials never reach our servers. Access to production data is limited to staff who need it and is logged. Push tokens are detached from an account at logout, so a resold or shared phone does not keep receiving the previous account's notifications.

No system is perfectly secure. If a breach affects you, we will tell you and the relevant authority as the law requires.

## 8. Children

TopHunt is 18+. We do not knowingly collect data from children. If we learn that an account belongs to a minor we close it and delete the data. If you believe a child is using TopHunt, write to {{SUPPORT_EMAIL}}.

## 9. Cookies and similar technologies

On tophunt.in we use local storage and similar technologies to keep you signed in, remember your theme preference, and measure aggregate usage. We do not use them for advertising. Clearing your browser storage signs you out.

## 10. Changes

We will update this policy as TopHunt changes. Material changes are announced in the app before they take effect, and the date at the top always reflects the current version.

## 11. Contact

Write to {{SUPPORT_EMAIL}} for any privacy question, data request or complaint.

Registered entity name and address: available on request from the address above, and stated in full on our published grievance page.`;

const REFUND_POLICY = `**Last updated: ${LEGAL_LAST_UPDATED}**

TopHunt is free. You never pay money in the app or on tophunt.in, so there is no money to refund. This policy explains what happens to your Diamonds and DP coins when a contest or an order does not go ahead.

## 1. Diamonds and DP coins

- **Diamonds** are free: earned from rewards and XP, and used to enter contests.
- **DP coins** are won in contests and spent in Shopping (gifts, digital items, physical products).

Neither can be bought, and neither can be exchanged for money.

## 2. Contest entry fees

An entry fee is committed the moment you join a contest and is not returned if you lose or change your mind, because your entry becomes part of someone else's contest.

**We return the entry fee when the contest does not go ahead:**

- no opponent joined before the contest's deadline,
- the contest was cancelled or ended without a result,
- the result was a tie, where the contest refunds ties,
- a fault on our side stopped the contest from running.

The fee returns to your Diamond balance automatically, usually within 24 hours.

## 3. Voided entries

If we void an entry for breaking the fair-play rules in the Terms of Service — vote buying, self-voting through another account, bots, multiple accounts, collusion, or entering media you do not own — its entry fee is not returned.

## 4. Shop orders

- You can cancel an order from **Shop → My orders** until it is packed. The DP coins return to your wallet straight away.
- An order held for a fraud check can also be cancelled while it is under review. If we reject it, the DP coins are returned.
- After delivery you can request a return from the order screen until the return date shown there. Once the return is accepted, the DP coins are refunded to your wallet.
- Digital items marked non-refundable cannot be returned. For other items, contact support.

## 5. Account closure

Deleting your account forfeits any remaining Diamonds and DP coins, so spend your DP coins first. We cannot restore a deleted account or its balance after the grace period.

## 6. Contact

Write to {{SUPPORT_EMAIL}} with your username and the order or contest concerned. We reply within 2 working days.`;

const COMMUNITY_GUIDELINES = `**Last updated: ${LEGAL_LAST_UPDATED}**

TopHunt is a contest platform: people put their photos and videos up against each other and other people vote. That only works while entries are honest and the voting is real. These guidelines are how we keep it that way.

They apply to everything you post — entries, posts, stories, comments, your profile, and your username.

## 1. Post your own work

Enter photos and videos **you** created. Not something you found, not a screenshot, not someone else's entry, not AI-generated media presented as a photograph of you.

Everyone recognisable in what you post must have agreed to appear in it. Do not post other people's children.

If you hold the rights to something you did not personally shoot, you may still enter it — but be ready to show that you do.

## 2. Win by being good, not by gaming

This is the rule with the most consequences attached, so it is worth being exact about.

**Not allowed:**

- Voting for yourself from another account.
- Buying, selling or trading votes. Vote-for-vote groups count.
- Bots, scripts, automation, emulators, or several devices used to influence a result.
- More than one account per person.
- Agreeing an outcome with another entrant.

**What happens:** the entry is voided and its fee is forfeited, a prize already paid may be reversed, and the account may be closed. We detect this from device signals, voting patterns and the relationships between accounts, and we act on the pattern rather than on a single vote.

## 3. Keep it safe to look at

Do not post:

- Sexual content, nudity, or anything sexualising a minor in any way at all. This is the one line where we report to the authorities as well as removing the content.
- Graphic violence, gore, or cruelty to animals.
- Self-harm or suicide content, or anything encouraging it. If you are struggling, please talk to someone — a crisis line in your country will take your call.
- Content promoting weapons, illegal drugs or criminal activity.
- Shocking content posted to disturb people.

## 4. Treat people decently

No harassment, no threats, no targeted pile-ons, and no hate. That means no attacking someone for their religion, caste, ethnicity, nationality, gender, sexual orientation, disability or appearance.

No sharing someone's private information — address, phone number, workplace, documents — without their agreement.

Disagreeing with people is fine. Voting against someone is the entire point of the app. Making the platform unpleasant for them is not.

## 5. Be who you say you are

Do not impersonate another person, a brand, a public figure, or TopHunt staff. Do not use someone else's photo as your profile picture. Do not run an account pretending to be an official one.

Parody and fan accounts are fine when they are obviously that and say so.

## 6. No spam, no scams

- No repetitive or bulk posting, and no unrelated content pushed into contest feeds.
- No fake giveaways, investment offers, "double your coins" schemes or phishing links.
- No selling accounts, coins, votes or followers.
- No promoting other platforms in a way that just uses TopHunt as a billboard.

Nobody from TopHunt will ever ask you for your password or an OTP. Anyone who does is trying to steal your account — report them.

## 7. Nothing illegal

Do not use TopHunt to break the law or to help anyone else break it. Do not post content that infringes someone's copyright or trademark.

## 8. Reporting, and what we do about it

Report anything that breaks these guidelines from the report option on the content, or write to {{SUPPORT_EMAIL}}. Tell us what you saw and where — specifics let us act on the same day.

Reports are confidential. The person you report is not told who reported them.

You can also **block** someone, which hides both of you from each other, or **mute** them, which quietly removes them from your feed without their knowing. Both are reversible from Settings, then Blocked & Muted.

**How we respond**, roughly in order of severity: we remove the content; we void an entry and forfeit its fee; we limit an account's ability to post or vote; we suspend it; we close it permanently. Child sexual content, credible threats of violence and coordinated fraud go straight to the last step.

**Repeat matters.** A first mistake usually gets a removal and an explanation. A pattern gets an account closed.

**You can appeal.** Reply to the notice you received, or write to {{SUPPORT_EMAIL}}. An appeal is reviewed by someone other than the person who made the original decision. If we got it wrong we will say so and restore what we removed.

## 9. These guidelines change

As the platform grows we will add to this list — usually because something happened that it did not cover. The date at the top tells you which version you are reading.

Thanks for keeping TopHunt worth competing on.`;

/** The bundled documents, before support-email interpolation. */
const BUNDLED: LegalContent = {
  termsOfService: TERMS_OF_SERVICE,
  privacyPolicy: PRIVACY_POLICY,
  refundPolicy: REFUND_POLICY,
  communityGuidelines: COMMUNITY_GUIDELINES,
};

/**
 * Substitute configured values into a document.
 *
 * Kept as tokens rather than hardcoded so each value lives in exactly one place
 * (`appConfig.supportEmail` / `appConfig.accountDeletionGraceDays`, the same
 * values the app itself reads). Admin-authored documents get the same treatment,
 * so an operator can use the tokens too.
 *
 * The grace period matters here specifically: the privacy policy states how long
 * data survives a deletion request, and an operator can change that number in the
 * panel. A hardcoded figure in the policy would become a false statement the first
 * time anyone touched the setting.
 */
function interpolate(text: string, supportEmail: string, graceDays: number): string {
  return text
    .replace(/\{\{SUPPORT_EMAIL\}\}/g, supportEmail)
    .replace(/\{\{DELETION_GRACE_DAYS\}\}/g, String(graceDays));
}

/**
 * The legal documents to serve, given the stored app config.
 *
 * Admin-authored content wins when it is present and not just whitespace;
 * otherwise the bundled document is served. This is deliberately per-document:
 * an operator who has written a custom Terms of Service should not thereby lose
 * the bundled Privacy Policy.
 *
 * The result is that no legal screen can ever render "not published yet" —
 * which was the production bug this file exists to fix.
 */
export function resolveLegalContent(cfg: any): LegalContent {
  const stored = (cfg?.legalContent ?? {}) as Partial<Record<LegalDocKey, unknown>>;
  const supportEmail =
    (typeof cfg?.supportEmail === "string" && cfg.supportEmail.trim()) || FALLBACK_SUPPORT_EMAIL;
  // Same parser the deletion routine enforces, so the policy cannot promise a
  // window the server will not honour.
  const graceDays = parseGraceDays(cfg?.accountDeletionGraceDays);

  const out = {} as LegalContent;
  for (const key of LEGAL_DOC_KEYS) {
    const value = stored[key];
    const custom = typeof value === "string" ? value.trim() : "";
    out[key] = interpolate(custom || BUNDLED[key], supportEmail, graceDays);
  }
  return out;
}

/** One admin editor row: the RAW content in effect for a doc + where it comes from. */
export interface LegalDocAdminView {
  key: LegalDocKey;
  label: string;
  note: string;
  /**
   * The RAW text the app resolves for this document right now — the stored
   * override if one exists, otherwise the bundled default — with `{{…}}` tokens
   * left INTACT. The editor shows this so the admin sees (and edits from) exactly
   * what the app serves, instead of an empty "override-only" box.
   */
  content: string;
  /** True when a stored override is in effect; false when it is the bundled default. */
  isCustom: boolean;
}

/**
 * The four documents as the admin editor needs them: the effective raw content
 * (override-or-bundled) plus whether each is currently a custom override.
 *
 * Deliberately RAW (tokens not interpolated): an override is stored with the tokens
 * so it keeps tracking `supportEmail` / the deletion grace period, exactly like the
 * bundled text does. `resolveLegalContent` interpolates on the way out.
 */
export function legalDocsForAdmin(cfg: any): LegalDocAdminView[] {
  const stored = (cfg?.legalContent ?? {}) as Partial<Record<LegalDocKey, unknown>>;
  return LEGAL_DOC_KEYS.map((key) => {
    const value = stored[key];
    const custom = typeof value === "string" ? value.trim() : "";
    return {
      key,
      label: LEGAL_DOC_META[key].label,
      note: LEGAL_DOC_META[key].note,
      content: custom || BUNDLED[key],
      isCustom: !!custom,
    };
  });
}
