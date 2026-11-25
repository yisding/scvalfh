/** si.com for the boys basketball build (tests/sblive-winter.ts). */
import { describeWinterSblive } from './sblive-winter';

describeWinterSblive({
  sport: 'basketball',
  segment: 'basketball',
  teamCount: 133,
  noJv: ['monterey-bay-academy', 'summit-tahoma', 'kipp-navigate', 'stratford'],
  namesakes: [
    'Fremont', 'Independence', 'Lincoln', 'Live Oak', 'Los Altos', 'Mountain View', 'Oak Grove', 'Pioneer',
    'Santa Clara', 'El Camino', 'Jefferson', 'Serra',
    'Marina', 'St. Francis', 'Cristo Rey', 'The Nueva School', 'Oakwood', 'Trinity Christian',
  ],
  page: { file: 'basketball-team-155793-homestead-mustangs.html', slug: 'homestead', sbliveTeamId: '155793' },
});
