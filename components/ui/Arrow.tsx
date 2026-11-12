/**
 * @deprecated Links carry no arrow (DESIGN §33): a link is its words. `Arrow` renders nothing and is
 * kept as an export until the pages stop importing it. The one drawn link glyph left is
 * ExternalLink's.
 */
export interface ArrowProps {
  /** Default 'right': the link leads on. 'up' and 'down' jump within the page. */
  dir?: 'right' | 'left' | 'up' | 'down';
  className?: string;
}

export function Arrow(props: ArrowProps) {
  void props;
  return null;
}

export default Arrow;
