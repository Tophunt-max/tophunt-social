/**
 * AdMob mediation adapters (bidding partners) for native builds.
 *
 * Driven by the ADMOB_MEDIATION build variable (GitHub Actions → EAS), JSON:
 *   {"meta":{"android":"6.20.0.0","ios":"6.20.0.0"},"applovin":{"android":"13.3.1.0","ios":"13.3.1.0"}}
 *
 * Versions are required and pinned on purpose: an adapter must match the
 * Google Mobile Ads SDK in the build (react-native-google-mobile-ads), and an
 * unpinned "+" would change the binary under you. Take them from Google's
 * mediation release notes for each partner.
 *
 * Partners are switched on and ordered in the AdMob console (Mediation →
 * bidding). Each partner's SKAdNetwork ids go in ADMOB_SKADNETWORK_IDS.
 */
const { withAppBuildGradle, withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PARTNERS = {
  meta: { maven: 'com.google.ads.mediation:facebook', pod: 'GoogleMobileAdsMediationFacebook' },
  applovin: { maven: 'com.google.ads.mediation:applovin', pod: 'GoogleMobileAdsMediationAppLovin' },
  unity: { maven: 'com.google.ads.mediation:unity', pod: 'GoogleMobileAdsMediationUnity' },
  liftoff: { maven: 'com.google.ads.mediation:vungle', pod: 'GoogleMobileAdsMediationVungle' },
  inmobi: { maven: 'com.google.ads.mediation:inmobi', pod: 'GoogleMobileAdsMediationInMobi' },
  pangle: { maven: 'com.google.ads.mediation:pangle', pod: 'GoogleMobileAdsMediationPangle', repo: 'https://artifact.bytedance.com/repository/pangle' },
  ironsource: { maven: 'com.google.ads.mediation:ironsource', pod: 'GoogleMobileAdsMediationIronSource', repo: 'https://android-sdk.is.com/' },
  mintegral: { maven: 'com.google.ads.mediation:mintegral', pod: 'GoogleMobileAdsMediationMintegral', repo: 'https://dl-maven-android.mintegral.com/repository/mbridge_android_sdk_oversea' },
};
const VERSION_RE = /^[0-9][0-9A-Za-z.\-]*$/;

/** Parse and validate the ADMOB_MEDIATION JSON. Throws with a clear message. */
function parseMediation(raw) {
  if (!raw || !String(raw).trim()) return [];
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    throw new Error('ADMOB_MEDIATION must be JSON like {"meta":{"android":"6.20.0.0","ios":"6.20.0.0"}}');
  }
  return Object.entries(cfg).map(([name, v]) => {
    const p = PARTNERS[name];
    if (!p) throw new Error(`ADMOB_MEDIATION: unknown partner "${name}". Known: ${Object.keys(PARTNERS).join(', ')}`);
    const android = v && v.android ? String(v.android) : '';
    const ios = v && v.ios ? String(v.ios) : '';
    for (const [k, ver] of [['android', android], ['ios', ios]]) {
      if (ver && !VERSION_RE.test(ver)) throw new Error(`ADMOB_MEDIATION: ${name}.${k} "${ver}" is not a version`);
    }
    if (!android && !ios) throw new Error(`ADMOB_MEDIATION: ${name} needs an android and/or ios version`);
    return { name, ...p, android, ios };
  });
}

const MARK = '// tophunt:admob-mediation';

function withAdMediation(config, { mediation = process.env.ADMOB_MEDIATION } = {}) {
  const partners = parseMediation(mediation);
  if (!partners.length) return config;

  config = withAppBuildGradle(config, (c) => {
    const lines = partners.filter((p) => p.android).map((p) => `    implementation("${p.maven}:${p.android}") ${MARK}`);
    let src = c.modResults.contents.split('\n').filter((l) => !l.includes(MARK)).join('\n');
    src = src.replace(/dependencies\s*\{/, (m) => `${m}\n${lines.join('\n')}`);
    c.modResults.contents = src;
    return c;
  });

  const repos = [...new Set(partners.filter((p) => p.android && p.repo).map((p) => p.repo))];
  if (repos.length) {
    config = withProjectBuildGradle(config, (c) => {
      let src = c.modResults.contents.split('\n').filter((l) => !l.includes(MARK)).join('\n');
      const add = repos.map((r) => `    maven { url "${r}" } ${MARK}`).join('\n');
      src = src.replace(/allprojects\s*\{\s*repositories\s*\{/, (m) => `${m}\n${add}`);
      c.modResults.contents = src;
      return c;
    });
  }

  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const file = path.join(c.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(file)) return c;
      let src = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !l.includes('# tophunt:admob-mediation')).join('\n');
      const pods = partners.filter((p) => p.ios).map((p) => `  pod '${p.pod}', '${p.ios}' # tophunt:admob-mediation`).join('\n');
      src = src.replace(/(\n\s*use_expo_modules!.*\n)/, `$1${pods}\n`);
      fs.writeFileSync(file, src);
      return c;
    },
  ]);
  return config;
}

module.exports = withAdMediation;
module.exports.parseMediation = parseMediation;
module.exports.PARTNERS = PARTNERS;
