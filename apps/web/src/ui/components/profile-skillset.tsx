'use client';

// Profile skillset manager — closes RESEARCH H2 (skills/languages/interests
// had POST /me/* endpoints with zero UI callers). Reads come from
// GET /me/profile (PROFILE_SELECT now includes the three relations); every
// mutation uses the existing POST /me/skills|languages|interests contracts
// and swaps in the list the API returns, so server and client never diverge.

import { useId, useState } from 'react';
import { Button, Input, Select } from '@bladna/ui';
import { api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/** Mirrors LanguageLevel (packages/validation manageLanguagesSchema). */
type LanguageLevel =
  'BEGINNER' | 'ELEMENTARY' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED' | 'NATIVE';

interface Named {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
}

export interface SkillEntry {
  skillId: string;
  skill: Named;
}

export interface LanguageEntry {
  languageId: string;
  level: LanguageLevel;
  language: Named;
}

export interface InterestEntry {
  interestId: string;
  interest: Named;
}

export interface ProfileSkillsetProps {
  locale: LocaleCode;
  skills: SkillEntry[];
  languages: LanguageEntry[];
  interests: InterestEntry[];
  catalogs: { skills: Named[]; languages: Named[]; interests: Named[] };
}

function nameOf(row: Named, locale: LocaleCode): string {
  return locale === 'ar' ? row.nameAr : locale === 'fr' ? row.nameFr : row.nameEn;
}

const CHIP =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-sand-200 bg-white ps-4 pe-3 ' +
  'text-sm text-sand-800 hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60';

export function ProfileSkillset({
  locale,
  skills: initialSkills,
  languages: initialLanguages,
  interests: initialInterests,
  catalogs,
}: ProfileSkillsetProps) {
  const { dict } = getDictionary(locale);
  const panelId = useId();

  const [skills, setSkills] = useState(initialSkills);
  const [languages, setLanguages] = useState(initialLanguages);
  const [interests, setInterests] = useState(initialInterests);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [filter, setFilter] = useState('');
  const [skillPick, setSkillPick] = useState('');
  const [languagePick, setLanguagePick] = useState('');
  const [levelPick, setLevelPick] = useState<LanguageLevel>('INTERMEDIATE');
  const [interestPick, setInterestPick] = useState('');

  const matches = (row: Named) =>
    !filter.trim() || nameOf(row, locale).toLowerCase().includes(filter.trim().toLowerCase());

  const skillOptions = catalogs.skills.filter(
    (row) => matches(row) && !skills.some((entry) => entry.skillId === row.id),
  );
  const languageOptions = catalogs.languages.filter(
    (row) => matches(row) && !languages.some((entry) => entry.languageId === row.id),
  );
  const interestOptions = catalogs.interests.filter(
    (row) => matches(row) && !interests.some((entry) => entry.interestId === row.id),
  );

  const allEmpty = skills.length === 0 && languages.length === 0 && interests.length === 0;

  async function mutate<T>(path: string, body: unknown, apply: (data: T) => void): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await api.post<T>(path, body);
      apply(data);
      setMessage({ tone: 'ok', text: dict.profile.manageSaved });
    } catch (cause) {
      setMessage({
        tone: 'err',
        text: errorMessageFor(cause, {
          errors: dict.errors,
          genericFallback: dict.errors.generic,
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  const removeSkill = (skillId: string) =>
    mutate<{ skills: SkillEntry[] }>('/me/skills', { remove: [skillId] }, (data) =>
      setSkills(data.skills),
    );

  const addSkill = () => {
    if (!skillPick) return;
    const skillId = skillPick;
    return mutate<{ skills: SkillEntry[] }>('/me/skills', { add: [{ skillId }] }, (data) => {
      setSkills(data.skills);
      setSkillPick('');
    });
  };

  const removeLanguage = (languageId: string) =>
    mutate<{ languages: LanguageEntry[] }>('/me/languages', { remove: [languageId] }, (data) =>
      setLanguages(data.languages),
    );

  const addLanguage = () => {
    if (!languagePick) return;
    const languageId = languagePick;
    return mutate<{ languages: LanguageEntry[] }>(
      '/me/languages',
      { add: [{ languageId, level: levelPick }] },
      (data) => {
        setLanguages(data.languages);
        setLanguagePick('');
      },
    );
  };

  const removeInterest = (interestId: string) =>
    mutate<{ interests: InterestEntry[] }>('/me/interests', { remove: [interestId] }, (data) =>
      setInterests(data.interests),
    );

  const addInterest = () => {
    if (!interestPick) return;
    const interestId = interestPick;
    return mutate<{ interests: InterestEntry[] }>(
      '/me/interests',
      { add: [interestId] },
      (data) => {
        setInterests(data.interests);
        setInterestPick('');
      },
    );
  };

  function chip(key: string, label: string, onRemove: () => void) {
    return (
      <li key={key}>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`${dict.profile.remove}: ${label}`}
          className={CHIP}
        >
          <span>{label}</span>
          <span aria-hidden="true" className="text-base leading-none text-sand-400">
            ×
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-sand-700">{dict.profile.skillsGroup}</h3>
        {skills.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {skills.map((entry) =>
              chip(
                entry.skillId,
                nameOf(entry.skill, locale),
                () => void removeSkill(entry.skillId),
              ),
            )}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-sand-700">{dict.profile.languagesGroup}</h3>
        {languages.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {languages.map((entry) =>
              chip(
                entry.languageId,
                `${nameOf(entry.language, locale)} · ${dict.profile.levels[entry.level]}`,
                () => void removeLanguage(entry.languageId),
              ),
            )}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-sand-700">{dict.profile.interestsGroup}</h3>
        {interests.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {interests.map((entry) =>
              chip(
                entry.interestId,
                nameOf(entry.interest, locale),
                () => void removeInterest(entry.interestId),
              ),
            )}
          </ul>
        ) : null}
      </div>

      {allEmpty ? <p className="text-sm text-sand-500">{dict.profile.skillsetEmpty}</p> : null}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="min-h-11"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {dict.profile.manage}
      </Button>

      {open ? (
        <div id={panelId} className="space-y-4 rounded-xl border border-sand-200 bg-sand-50 p-4">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={dict.profile.searchCatalog}
            aria-label={dict.common.search}
            autoComplete="off"
          />

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Select
              label={dict.profile.skillsGroup}
              value={skillPick}
              onChange={(event) => setSkillPick(event.target.value)}
              className="min-h-11"
            >
              <option value="">{dict.profile.add}…</option>
              {skillOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {nameOf(row, locale)}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              loading={busy}
              disabled={!skillPick}
              onClick={() => void addSkill()}
            >
              {dict.profile.add}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Select
              label={dict.profile.languagesGroup}
              value={languagePick}
              onChange={(event) => setLanguagePick(event.target.value)}
              className="min-h-11"
            >
              <option value="">{dict.profile.add}…</option>
              {languageOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {nameOf(row, locale)}
                </option>
              ))}
            </Select>
            <Select
              label={dict.profile.level}
              value={levelPick}
              onChange={(event) => setLevelPick(event.target.value as LanguageLevel)}
              className="min-h-11"
            >
              {(Object.keys(dict.profile.levels) as LanguageLevel[]).map((level) => (
                <option key={level} value={level}>
                  {dict.profile.levels[level]}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              loading={busy}
              disabled={!languagePick}
              onClick={() => void addLanguage()}
            >
              {dict.profile.add}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Select
              label={dict.profile.interestsGroup}
              value={interestPick}
              onChange={(event) => setInterestPick(event.target.value)}
              className="min-h-11"
            >
              <option value="">{dict.profile.add}…</option>
              {interestOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {nameOf(row, locale)}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              loading={busy}
              disabled={!interestPick}
              onClick={() => void addInterest()}
            >
              {dict.profile.add}
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          role={message.tone === 'ok' ? 'status' : 'alert'}
          className={`text-sm ${message.tone === 'ok' ? 'text-brand-700' : 'text-red-700'}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
