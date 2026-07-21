/**
 * "Name It" quiz content manifest (paid Meta traffic bridge pages).
 *
 * Cold video-ad traffic ("Can you name these 4 things?") lands on a
 * message-matched interactive quiz at `/play/name-it/<theme>` that continues
 * the ad's game before handing off to signup. One reusable Astro template
 * (`src/pages/play/name-it/[theme].astro`) renders every theme from the data
 * here — add a creative to `NAME_IT`, wire it into `THEME_DEFAULT`, drop the
 * images under `public/play/<theme>/`, and the route builds automatically.
 *
 * `image` values are FILENAMES only; the template resolves them to
 * `/play/<theme>/<image>` (files already copied into `public/`).
 */

export type ThemeName = 'kitchen' | 'bathroom' | 'car' | 'garden' | 'football';

/** A single object the player is asked to name. */
export interface NameItItem {
  /** The target word or phrase (revealed answer). */
  word: string;
  /** IPA pronunciation, including the enclosing slashes. */
  ipa: string;
  /** Plain-language clue shown alongside the revealed word. */
  clue: string;
  /** Image filename under `public/play/<theme>/`. */
  image: string;
}

/** One ad creative: the hero line + its four objects. Keyed by creative id. */
export interface NameItCreative {
  /** Stable creative id, also used as the `?v=` value in ad URLs. */
  id: string;
  /** Theme this creative belongs to. */
  theme: ThemeName;
  /** Hero headline — message-matches the ad's opening line. */
  adLine: string;
  /** Exactly four objects to name. */
  items: NameItItem[];
}

export const NAME_IT: Record<string, NameItCreative> = {
  'kitchen-ep4': {
    id: 'kitchen-ep4',
    theme: 'kitchen',
    adLine: 'Can you name these 4 kitchen things?',
    items: [
      {
        word: 'spatula',
        ipa: '/ˈspætʃ.ə.lə/',
        clue: 'the flat tool you flip a pancake with',
        image: 'spatula.jpg',
      },
      {
        word: 'tongs',
        ipa: '/tɔːŋz/',
        clue: 'the two-armed tool you grip and turn food with',
        image: 'tongs.jpg',
      },
      {
        word: 'frying pan',
        ipa: '/ˈfraɪ.ɪŋ ˌpæn/',
        clue: 'the shallow pan you fry an egg in',
        image: 'frying-pan.jpg',
      },
      {
        word: 'oven mitt',
        ipa: '/ˈʌv.ən ˌmɪt/',
        clue: 'the padded glove for holding hot dishes',
        image: 'oven-mitt.jpg',
      },
    ],
  },
  'bathroom-ep1': {
    id: 'bathroom-ep1',
    theme: 'bathroom',
    adLine: 'Can you name these 4 bathroom things?',
    items: [
      {
        word: 'showerhead',
        ipa: '/ˈʃaʊ.ɚ.hed/',
        clue: 'the water sprays from it',
        image: 'showerhead.jpg',
      },
      {
        word: 'bathtub',
        ipa: '/ˈbæθ.tʌb/',
        clue: 'you soak in it',
        image: 'bathtub.jpg',
      },
      {
        word: 'drain',
        ipa: '/dreɪn/',
        clue: 'water runs away here',
        image: 'drain.jpg',
      },
      {
        word: 'towel bar',
        ipa: '/ˈtaʊ.əl bɑːr/',
        clue: 'you hang your towel on it',
        image: 'towel-bar.jpg',
      },
    ],
  },
  'car-ep1': {
    id: 'car-ep1',
    theme: 'car',
    adLine: 'Can you name these 4 parts of a car?',
    items: [
      {
        word: 'steering wheel',
        ipa: '/ˈstɪr.ɪŋ ˌwiːl/',
        clue: 'the wheel you turn to steer the car',
        image: 'steering-wheel.jpg',
      },
      {
        word: 'windshield',
        ipa: '/ˈwɪnd.ʃiːld/',
        clue: 'the big front window (UK: windscreen)',
        image: 'windshield.jpg',
      },
      {
        word: 'trunk',
        ipa: '/trʌŋk/',
        clue: 'storage space at the back (UK: boot)',
        image: 'trunk.jpg',
      },
      {
        word: 'bumper',
        ipa: '/ˈbʌm.pɚ/',
        clue: 'the bar that absorbs a crash',
        image: 'bumper.jpg',
      },
    ],
  },
  'garden-ep1': {
    id: 'garden-ep1',
    theme: 'garden',
    adLine: 'Can you name these 4 garden things?',
    items: [
      {
        word: 'watering can',
        ipa: '/ˈwɔː.tɚ.ɪŋ ˌkæn/',
        clue: 'the spouted can you pour water on plants with',
        image: 'watering-can.jpg',
      },
      {
        word: 'garden hose',
        ipa: '/ˈɡɑːr.dən ˌhoʊz/',
        clue: 'the long flexible tube for spraying water',
        image: 'garden-hose.jpg',
      },
      {
        word: 'lawnmower',
        ipa: '/ˈlɔːnˌmoʊ.ɚ/',
        clue: 'the machine you push to cut the grass',
        image: 'lawnmower.jpg',
      },
      {
        word: 'rake',
        ipa: '/reɪk/',
        clue: 'the fan-shaped tool you gather leaves with',
        image: 'rake.jpg',
      },
    ],
  },
  'football-ep1': {
    id: 'football-ep1',
    theme: 'football',
    adLine: 'Can you name these 4 things at a football match?',
    items: [
      {
        word: 'corner flag',
        ipa: '/ˈkɔːr.nɚ flæɡ/',
        clue: 'it marks each corner of the field',
        image: 'corner-flag.jpg',
      },
      {
        word: 'crossbar',
        ipa: '/ˈkrɔːs.bɑːr/',
        clue: 'the bar across the top of the goal',
        image: 'crossbar.jpg',
      },
      {
        word: 'penalty spot',
        ipa: '/ˈpen.əl.ti spɑːt/',
        clue: 'the ball sits here for a penalty',
        image: 'penalty-spot.jpg',
      },
      {
        word: 'dugout',
        ipa: '/ˈdʌɡ.aʊt/',
        clue: 'where the coaches and subs sit',
        image: 'dugout.jpg',
      },
    ],
  },
};

/** Default creative to render for each theme (today: one creative per theme). */
export const THEME_DEFAULT: Record<ThemeName, string> = {
  kitchen: 'kitchen-ep4',
  bathroom: 'bathroom-ep1',
  car: 'car-ep1',
  garden: 'garden-ep1',
  football: 'football-ep1',
};

/** Every theme that gets a static `/play/name-it/<theme>` page. */
export const THEMES: ThemeName[] = ['kitchen', 'bathroom', 'car', 'garden', 'football'];
