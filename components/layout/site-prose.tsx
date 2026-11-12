import { Fragment } from 'react';

import ExternalLink from '../ui/ExternalLink';
import { listWords } from '../../lib/format';
import { SECTIONS } from '../../lib/league-config/sections';
import type { LeagueConfig } from '../../lib/league-config/shape';
import { LEAGUES_PROPER, getSection } from '../../lib/leagues';
import { SOURCE_LINKS } from '../../lib/season';

import { SITE_SCOPE_NOTE } from './site';

/**
 * The three paragraphs that used to fill the footer (DESIGN §33; SPEC §6), kept word for word and
 * link for link so /about can carry them: where the data and each league's rules come from
 * (`SourcesProse`), exactly what is covered (`ScopeProse`, SPEC §11) and the not-affiliated line
 * (`DisclaimerProse`). The footer itself now says the short version on every page.
 *
 * The league and section lists are built from lib/leagues.ts in config order, so they read exactly
 * "SCVAL, BVAL, PCAL and MCAL; EAL rules from the CIF Northern Section" and can never drift from the
 * config. A league with no document of its own (every division `official.mode === 'none'`: the EAL)
 * takes its rules from its section's guidelines, so it is named in the second clause, linked to its
 * `officialUrl`, not credited with alignment. A league whose table this site orders by its own
 * 3-1-0 points (`rules.orderScope === 'site'`: the Sunset and the three San Diego leagues,
 * DESIGN-socal §2.1.7) publishes no rules at all, so it is not credited with rules either: per
 * section, "Sunset: we found no published league rules; Southern Section rules from the CIF
 * Southern Section" (what we found, not a claim that none exist: review 2026-10-06), the section
 * linked to the document its rules are in (SectionConfig.rulesSource). The not-affiliated line names
 * every league and every section (CIF-CCS … CIF-SS, CIF-SDS) from config.
 */
export interface SiteProseProps {
  className?: string;
}

/** Leagues that publish no schedule or standings document of their own (the EAL, and every SoCal league). */
function hasNoDocument(league: LeagueConfig): boolean {
  return league.divisions.every((d) => d.official.mode === 'none');
}

/** Leagues that publish no rules this site follows: the table order is the site's own (orderScope 'site'). */
function hasNoRules(league: LeagueConfig): boolean {
  return league.rules.orderScope === 'site';
}

/** The orderScope 'site' leagues grouped by section, config order: [[SS, [Sunset]], [SDS, [City, …]]]. */
function noRulesBySection() {
  return SECTIONS.flatMap((section) => {
    const leagues = LEAGUES_PROPER.filter((l) => l.sectionId === section.id && hasNoRules(l));
    return leagues.length === 0 ? [] : [{ section, leagues }];
  });
}

/** 'A, B, C and D' */
function joined(items: readonly React.ReactNode[]): React.ReactNode[] {
  return items.map((item, i) => (
    <Fragment key={i}>
      {i === 0 ? null : i === items.length - 1 ? ' and ' : ', '}
      {item}
    </Fragment>
  ));
}

/** "Data from MaxPreps and High School on SI (si.com) … League alignment and rules from …." */
export function SourcesProse({ className }: SiteProseProps) {
  return (
    <p className={className}>
      Data from{' '}
      <ExternalLink href={SOURCE_LINKS.maxpreps} arrow={false}>
        MaxPreps
      </ExternalLink>{' '}
      and{' '}
      <ExternalLink href={SOURCE_LINKS.sblive} arrow={false}>
        High School on SI (si.com)
      </ExternalLink>
      ; scores cross-checked against{' '}
      <ExternalLink href={SOURCE_LINKS.cifss} arrow={false}>
        cifsshome.org
      </ExternalLink>
      . League alignment and rules from{' '}
      {joined(
        LEAGUES_PROPER.filter((l) => !hasNoDocument(l)).map((l) => (
          <ExternalLink key={l.id} href={l.officialUrl} arrow={false}>
            {l.shortName}
          </ExternalLink>
        )),
      )}
      {LEAGUES_PROPER.filter((l) => hasNoDocument(l) && !hasNoRules(l)).map((l) => (
        <Fragment key={l.id}>
          ; {l.shortName} rules from the{' '}
          <ExternalLink href={l.officialUrl} arrow={false}>
            CIF {getSection(l.sectionId).name}
          </ExternalLink>
        </Fragment>
      ))}
      {noRulesBySection().map(({ section, leagues }) => (
        <Fragment key={section.id}>
          ; {listWords(leagues.map((l) => l.shortName))}: we found no published league rules; {section.name} rules
          from the{' '}
          <ExternalLink href={section.rulesSource.url} arrow={false}>
            CIF {section.name}
          </ExternalLink>
        </Fragment>
      ))}
      .
    </p>
  );
}

/** The scope note: every section and league covered, and that other teams appear only as opponents. */
export function ScopeProse({ className }: SiteProseProps) {
  return <p className={className}>{SITE_SCOPE_NOTE}</p>;
}

/**
 * "Unofficial; not affiliated with …". The leagues only: the LA independents are three schools in
 * no league, not an organization (DESIGN §24.9). Each `CIF-XX` code is one nowrap span, so a phone
 * never breaks it at its hyphen; the hyphen stays plain ASCII so copy and search still find "CIF-NCS".
 */
export function DisclaimerProse({ className }: SiteProseProps) {
  const names: React.ReactNode[] = [
    ...LEAGUES_PROPER.map((l) => l.shortName),
    ...SECTIONS.map((s) => (
      <span key={s.id} className="whitespace-nowrap">
        {`CIF-${s.shortName}`}
      </span>
    )),
    'MaxPreps',
  ];
  return (
    <p className={className}>
      This is an unofficial site, not affiliated with{' '}
      {names.map((name, i) => (
        <Fragment key={i}>
          {i === 0 ? null : ', '}
          {name}
        </Fragment>
      ))}{' '}
      or SI. Records are computed from published game results and may differ from official standings.
    </p>
  );
}
