/** si.com for the boys basketball build (tests/sblive-winter.ts). */
import { describeWinterSblive } from './sblive-winter';

describeWinterSblive({
  sport: 'basketball',
  segment: 'basketball',
  teamCount: 41,
  noJv: [],
  namesakes: [
    'Fremont', 'Independence', 'Lincoln', 'Live Oak', 'Los Altos', 'Mountain View', 'Oak Grove', 'Pioneer',
    'Santa Clara',
  ],
  page: { file: 'basketball-team-155793-homestead-mustangs.html', slug: 'homestead', sbliveTeamId: '155793' },
});
