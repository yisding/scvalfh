/** si.com for the girls soccer build (tests/sblive-winter.ts). */
import { describeWinterSblive } from './sblive-winter';

describeWinterSblive({
  sport: 'soccer',
  segment: 'girls-soccer',
  teamCount: 123,
  noJv: ['eastside', 'monterey-bay-academy', 'summit-tahoma', 'summit-prep', 'kipp-navigate'],
  namesakes: [
    'Fremont', 'Independence', 'Lincoln', 'Live Oak', 'Los Altos', 'Mountain View', 'Oak Grove', 'Pioneer',
    'Santa Clara', 'Mercy', 'Notre Dame', 'El Camino', 'Jefferson',
    'Marina', 'St. Francis', 'Cristo Rey', 'The Nueva School',
  ],
  page: { file: 'girls-soccer-team-364703-homestead-mustangs.html', slug: 'homestead', sbliveTeamId: '364703' },
});
