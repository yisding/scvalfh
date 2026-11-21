/** si.com for the girls soccer build (tests/sblive-winter.ts). */
import { describeWinterSblive } from './sblive-winter';

describeWinterSblive({
  sport: 'soccer',
  segment: 'girls-soccer',
  teamCount: 60,
  noJv: ['eastside'],
  namesakes: [
    'Fremont', 'Independence', 'Lincoln', 'Live Oak', 'Los Altos', 'Mountain View', 'Oak Grove', 'Pioneer',
    'Santa Clara', 'Mercy', 'Notre Dame',
  ],
  page: { file: 'girls-soccer-team-364703-homestead-mustangs.html', slug: 'homestead', sbliveTeamId: '364703' },
});
