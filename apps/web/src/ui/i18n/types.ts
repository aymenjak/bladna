import type {
  ApplicationStatus,
  BenefitType,
  BenefitValue,
  CampaignStatus,
  ContributionStatus,
  InternationalApplicationStatus,
  InternationalProjectType,
  InvoiceStatus,
  LocaleCode,
  LocationType,
  MetricType,
  NotificationChannel,
  NotificationType,
  OpportunityStatus,
  OpportunityType,
  OrgMemberRole,
  OrganizationStatus,
  OrganizationType,
  PaymentMethod,
  PaymentStatus,
  PlanTier,
  QuestionType,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  RequirementType,
  RiskLevel,
  SponsorshipKind,
  SubscriptionStatus,
  SupportNeedKind,
  SupportOfferStatus,
  SystemRole,
  TrustLevel,
  UserStatus,
  VerificationStatus,
} from '@bladna/types';

/** UI copy for every locale. Keys must exist in all three dictionaries (type-checked). */

export interface PillarCopy {
  title: string;
  body: string;
}

export interface LegalSection {
  heading: string;
  body: string;
}

export interface Dictionary {
  meta: {
    siteName: string;
    tagline: string;
    description: string;
  };
  nav: {
    home: string;
    /** Landmark name for the signed-in mobile bottom tab bar (P3 / M3). */
    tabBar: string;
    account: string;
    opportunities: string;
    map: string;
    organizations: string;
    volunteers: string;
    campaigns: string;
    international: string;
    dashboard: string;
    admin: string;
    login: string;
    register: string;
    logout: string;
    language: string;
    messages: string;
    settings: string;
    safety: string;
    billing: string;
    help: string;
    terms: string;
    privacy: string;
  };
  landing: {
    heroTitle: string;
    heroSubtitle: string;
    heroBadge: string;
    ctaPrimary: string;
    ctaSecondary: string;
    /** Hero CTAs + search (spec §8–§9): initiatives are the core object. */
    heroCtaSupport: string;
    heroCtaCreate: string;
    heroSearch: string;
    heroSearchPlaceholder: string;
    /** P26 hero slideshow controls (reference: mjeunesse.gov.dz slider). */
    sliderLabel: string;
    /** Prefixed with the slide number: "Show slide 2". */
    slideShow: string;
    playShow: string;
    pauseShow: string;
    /** Home discovery sections (spec §9). */
    categoriesTitle: string;
    volunteersTitle: string;
    supportTitle: string;
    recentTitle: string;
    viewAll: string;
    discoverMap: string;
    /** Discovery launcher panel: quick chips + browse-by-cause in one block. */
    discoverTitle: string;
    discoverBody: string;
    /** P26 digital-services grid — verify, map, directory, international. */
    servicesTitle: string;
    servicesMapBody: string;
    /** Pre-title labels — one per marketing section (DESIGN.md eyebrow role). */
    eyebrows: {
      discover: string;
      pillars: string;
      how: string;
      impact: string;
      services: string;
    };
    /** Shown instead of a hole when no initiatives are published yet. */
    emptyRail: string;
    statsTitle: string;
    statsInitiatives: string;
    statsOrganizations: string;
    statsVolunteers: string;
    statsHours: string;
    /** Honesty label shown under the landing impact figures (seeded demo data). */
    statsNote: string;
    features: [string, string, string, string];
    /** Initiative lifecycle — the platform's core idea (P21): register →
        describe → review → run → document, ending in one shared record. */
    journey: {
      eyebrow: string;
      title: string;
      body: string;
      steps: Array<{ title: string; body: string }>;
      /** The outcome of the path, rendered as the closing cell. */
      trust: { title: string; body: string };
    };
    pillarsTitle: string;
    pillars: {
      identity: PillarCopy;
      experience: PillarCopy;
      opportunities: PillarCopy;
      organizations: PillarCopy;
      csr: PillarCopy;
      international: PillarCopy;
    };
    howTitle: string;
    how: [string, string, string];
    /** One supporting line under each step (honest, matches real flows). */
    howHints: [string, string, string];
    verifyTitle: string;
    verifyBody: string;
    verifyCta: string;
    finalCtaTitle: string;
    finalCtaBody: string;
    /** BLADNA International landing section (spec §58). */
    intlTitle: string;
    intlBody: string;
    intlCta: string;
  };
  opportunity: {
    /** Section pre-titles on the detail page (SectionHeading eyebrow role). */
    eyebrows: {
      story: string;
      needs: string;
      requirements: string;
      impact: string;
    };
    listSubtitle: string;
    /** Pre-title above the list h1 (DESIGN.md PageHeader anatomy). */
    listEyebrow: string;
    /** Live result total — `{count}` is replaced with the formatted number. */
    resultsCount: string;
    noResults: string;
    /** What to do next when a filtered list is empty. */
    noResultsHint: string;
    clearFilters: string;
    /** Accessible suffix for an active-filter chip that removes itself (P3). */
    removeFilter: string;
    // Discover filter controls (spec §9/§11).
    filterNeeds: string;
    filterCategory: string;
    filterWilaya: string;
    filterVerified: string;
    filterNeedsVolunteers: string;
    filterNeedsSupport: string;
    filterNearMe: string;
    filterThisWeek: string;
    nearMeLocating: string;
    nearMeError: string;
    sortLabel: string;
    sorts: {
      recent: string;
      deadline: string;
      soonest: string;
      popular: string;
    };
    organizedBy: string;
    about: string;
    requirements: string;
    benefits: string;
    benefitTypes: Record<BenefitType, string>;
    benefitValues: Record<BenefitValue, string>;
    requirementTypes: Record<RequirementType, string>;
    questionTypes: Record<QuestionType, string>;
    motivation: string;
    motivationHint: string;
    availabilityLabel: string;
    applySuccess: string;
    applyLogin: string;
    applyVerifyEmail: string;
    backToList: string;
    deadlinePassed: string;
    openedOn: string;
    // Initiative detail page (spec §4/§5/§12–§14)
    types: Record<OpportunityType, string>;
    locationTypes: Record<LocationType, string>;
    problemTitle: string;
    objectiveTitle: string;
    needsTitle: string;
    needsEmpty: string;
    volunteersNeeded: string;
    joined: string;
    needKinds: Record<SupportNeedKind, string>;
    progressLabel: string;
    acceptedOffers: string;
    acceptedAmount: string;
    receivedLabel: string;
    acceptedLabel: string;
    needComplete: string;
    helpTitle: string;
    supportLogin: string;
    offerFormTitle: string;
    offerDescription: string;
    offerQuantity: string;
    offerAmount: string;
    offerContactNote: string;
    offerSubmit: string;
    offerSending: string;
    offerSuccess: string;
    offerError: string;
    offerBankNote: string;
    offerClosed: string;
    contactTitle: string;
    contactFallbackNote: string;
    /** P23 — the contact card's channel when no phone/email is published. */
    messageOrganization: string;
    impactTitle: string;
    impactSelfReported: string;
    openMap: string;
    /** Pre-title above the map h1 (DESIGN.md PageHeader anatomy). */
    mapEyebrow: string;
    mapSubtitle: string;
    /** Map controls (P3 / H5) — targets stay ≥44px per the kit floor. */
    zoomIn: string;
    zoomOut: string;
    resetView: string;
    searchThisArea: string;
    resultsInView: string;
    // P24 — participant reviews & ratings on the detail page.
    /** Section title — ASCII-only copy (no `&`), probe/HTML-escaping safe. */
    reviewsTitle: string;
    /** `{count}` is replaced with the formatted review total. */
    reviewsCount: string;
    /** Who may review (accepted application or verified hours) — always shown. */
    reviewsNote: string;
    reviewsEmpty: string;
    /** Display name fallback when the author has no opt-in public profile. */
    reviewAnonymous: string;
    /** Provenance badge — which eligibility path qualified the reviewer. */
    reviewSources: {
      participant: string;
      hours: string;
    };
    reviewYour: string;
    reviewEdited: string;
    /** radiogroup aria-label for the star input. */
    reviewRatingLabel: string;
    /** `{n}` is replaced with the star number (1–5). */
    reviewRate: string;
    reviewBodyLabel: string;
    reviewBodyPlaceholder: string;
    reviewPublish: string;
    reviewEdit: string;
    reviewDelete: string;
    reviewDeleteConfirm: string;
    reviewSignin: string;
  };
  /** Saved opportunities / favorites (P5). */
  saved: {
    title: string;
    subtitle: string;
    /** Toggle-button state once saved (paired with `common.save`). */
    savedState: string;
    removeLabel: string;
    error: string;
    empty: string;
    emptyBody: string;
    /** Shown on a bookmark whose initiative is no longer open (still listed). */
    unavailable: string;
  };
  /** Personalized matching strip + page (P5, engine reason codes). */
  matching: {
    title: string;
    subtitle: string;
    scoreLabel: string;
    empty: string;
    emptyBody: string;
    emptyCta: string;
    viewAll: string;
    /** Transparency note rendered under the list (P5). */
    howItWorks: string;
    reasons: {
      SKILL_MATCH: string;
      INTEREST_MATCH: string;
      LOCATION_MATCH: string;
      LANGUAGE_MATCH: string;
      AVAILABILITY_MATCH: string;
      ONLINE_PREFERENCE: string;
      INTERNATIONAL_PREFERENCE: string;
      EXPERIENCED_VOLUNTEER: string;
    };
  };
  /** Public volunteer directory page (P5). */
  directory: {
    title: string;
    subtitle: string;
    filterSkill: string;
    verifiedOnly: string;
    empty: string;
    emptyBody: string;
    privacyNote: string;
    emailLabel: string;
    idLabel: string;
    verificationStatuses: {
      UNVERIFIED: string;
      BASIC_VERIFIED: string;
      IDENTITY_VERIFIED: string;
    };
    // ── Public volunteer profile (P25) ──────────────────────
    profileBack: string;
    profileAbout: string;
    profileMemberSince: string;
    profilePrivacyNote: string;
    profileHoursHidden: string;
    profileCertsHidden: string;
    availabilitySlots: {
      WEEKDAYS: string;
      WEEKENDS: string;
      EVENINGS: string;
      NIGHTS: string;
      HOLIDAYS: string;
      FLEXIBLE: string;
    };
  };
  applications: {
    title: string;
    subtitle: string;
    empty: string;
    viewOpportunity: string;
    withdraw: string;
    withdrawConfirm: string;
    withdrawn: string;
    submittedOn: string;
  };
  inbox: {
    title: string;
    subtitle: string;
    empty: string;
    unreadOnly: string;
    markRead: string;
    markAllRead: string;
    markedRead: string;
    unread: string;
  };
  invitations: {
    title: string;
    subtitle: string;
    accept: string;
    accepting: string;
    accepted: string;
    acceptedBody: string;
    missingToken: string;
    missingTokenBody: string;
    roleLabel: string;
  };
  profile: {
    title: string;
    subtitle: string;
    statsTitle: string;
    verifiedHours: string;
    completedActivities: string;
    attendanceCount: string;
    achievementsCount: string;
    hoursTitle: string;
    hoursEmpty: string;
    certificatesTitle: string;
    certificatesEmpty: string;
    /** Per-certificate PDF download link (RESEARCH H1 — the missing payoff). */
    certificatePdf: string;
    achievementsTitle: string;
    achievementsEmpty: string;
    cardTitle: string;
    cardMissing: string;
    cardIssue: string;
    cardDownload: string;
    cvTitle: string;
    cvDownload: string;
    dataTitle: string;
    dataHint: string;
    dataExport: string;
    dataDeactivate: string;
    dataDelete: string;
    dataSent: string;
    /** Skillset section — groups rendered under one heading on the profile. */
    skillsetTitle: string;
    skillsGroup: string;
    languagesGroup: string;
    interestsGroup: string;
    skillsetEmpty: string;
    /** Manage-island controls (client component). */
    manage: string;
    searchCatalog: string;
    add: string;
    remove: string;
    level: string;
    levels: Record<
      'BEGINNER' | 'ELEMENTARY' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED' | 'NATIVE',
      string
    >;
    manageSaved: string;
    /** Participation timeline (GET /me/activities — VolunteerActivity rows). */
    experienceTitle: string;
    experienceEmpty: string;
    activityStatuses: Record<'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED', string>;
    hourStatuses: Record<'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED', string>;
    certificateStatuses: Record<'VALID' | 'REVOKED' | 'EXPIRED', string>;
  };
  common: {
    loading: string;
    retry: string;
    save: string;
    cancel: string;
    confirm: string;
    close: string;
    search: string;
    submit: string;
    required: string;
    optional: string;
    yes: string;
    no: string;
    page: string;
    of: string;
    previous: string;
    next: string;
    viewAll: string;
    empty: string;
    error: string;
    backHome: string;
    /** Accessible name of the skip-to-content link (destination: #main). */
    skipToContent: string;
    signIn: string;
    createdAt: string;
    status: string;
    all: string;
    filters: string;
    apply: string;
    applyNow: string;
    deadline: string;
    applicants: string;
    views: string;
    verified: string;
    report: string;
    /** P23 — short action label: a directory card / profile "Message" link. */
    message: string;
    remote: string;
    local: string;
    national: string;
    online: string;
    international: string;
    event: string;
    campaign: string;
    type: string;
    description: string;
    organization: string;
    location: string;
    skills: string;
    hours: string;
    capacity: string;
    startDate: string;
    endDate: string;
    missingPageTitle: string;
    missingPageBody: string;
    menuOpen: string;
    menuClose: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    email: string;
    password: string;
    currentPassword: string;
    newPassword: string;
    firstName: string;
    lastName: string;
    phone: string;
    confirmPassword: string;
    totpCode: string;
    mfaTitle: string;
    mfaSubtitle: string;
    mfaVerify: string;
    recoveryHint: string;
    forgotPassword: string;
    forgotTitle: string;
    forgotSubtitle: string;
    resetSent: string;
    resetTitle: string;
    resetSubtitle: string;
    resetDone: string;
    noAccount: string;
    haveAccount: string;
    createAccount: string;
    verifyTitle: string;
    verifySubtitle: string;
    verifySuccess: string;
    verifyResend: string;
    resendSent: string;
    consentTerms: string;
    consentPrivacy: string;
    consentMarketing: string;
    accountType: string;
    volunteerAccount: string;
    organizationAccount: string;
    invalidCredentials: string;
    passwordHint: string;
    signingIn: string;
    creatingAccount: string;
    passwordMismatch: string;
    consentRequired: string;
    consentDocs: string;
    logoutEverywhere: string;
    savePassword: string;
    sendReset: string;
    demoTitle: string;
    demoBody: string;
    demoPassword: string;
    demoUse: string;
    demoNo2fa: string;
    demoCopy: string;
    demoCopied: string;
    demoNote: string;
    /** Reveal toggle on password fields (P12). */
    showPassword: string;
    hidePassword: string;
  };
  dashboard: {
    title: string;
    welcome: string;
    /** Pre-title above the greeting (SectionHeading eyebrow role). */
    eyebrow: string;
    /** Section pre-title above the quick-link bento. */
    quickLinksTitle: string;
    profile: string;
    applications: string;
    hours: string;
    certificates: string;
    notifications: string;
    noApplications: string;
    noCertificates: string;
    accountNotVerified: string;
    verifyEmailCta: string;
    mfaPendingNotice: string;
    organizationsTitle: string;
    myOrganizations: string;
    noOrganizations: string;
    createOrganization: string;
    adminTitle: string;
    adminSubtitle: string;
    opportunitiesTitle: string;
    newOpportunity: string;
    reportsTitle: string;
    riskTitle: string;
    auditTitle: string;
    moderationTitle: string;
    usersTitle: string;
    settingsTitle: string;
    flagsTitle: string;
    emptyAdmin: string;
    statVolunteerId: string;
    statOpenHint: string;
    supportOffersTitle: string;
    noSupportOffers: string;
  };
  settings: {
    title: string;
    subtitle: string;
    accountTitle: string;
    accountHint: string;
    savedOk: string;
    yourUserId: string;
    yourUserIdHint: string;
    conversationLink: string;
    copyLink: string;
    linkCopied: string;
    passwordTitle: string;
    passwordChanged: string;
    sessionsTitle: string;
    sessionsHint: string;
    sessionCurrent: string;
    sessionRevoke: string;
    sessionRevoked: string;
    privacyTitle: string;
    privacyHint: string;
    publicProfile: string;
    publicPhone: string;
    publicEmail: string;
    showWilaya: string;
    showHours: string;
    showCertificates: string;
    twoFactorTitle: string;
    twoFactorHint: string;
    twoFactorOn: string;
    twoFactorOff: string;
    twoFactorEnable: string;
    twoFactorSetupHint: string;
    twoFactorConfirm: string;
    twoFactorDisable: string;
    twoFactorRecoveryTitle: string;
    twoFactorRecoveryHint: string;
    twoFactorEnabled: string;
    twoFactorDisabled: string;
    notificationsTitle: string;
    notificationsHint: string;
    notificationsSaved: string;
    notificationsAlways: string;
    notificationsUnavailable: string;
    notificationTypes: Record<NotificationType, string>;
    notificationChannels: Record<NotificationChannel, string>;
  };
  safety: {
    title: string;
    subtitle: string;
    reportTitle: string;
    reportHint: string;
    targetType: string;
    targetId: string;
    targetIdHint: string;
    targetIdHintCertificate: string;
    reason: string;
    description: string;
    descriptionHint: string;
    submit: string;
    sent: string;
    myReportsTitle: string;
    noReports: string;
    reasons: Record<ReportReason, string>;
    targetTypes: Record<ReportTargetType, string>;
    statuses: Record<ReportStatus, string>;
    guidanceTitle: string;
    guidance: [string, string, string, string];
  };
  messages: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    unreadOnly: string;
    newConversation: string;
    recipientLabel: string;
    recipientHint: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    start: string;
    noConversations: string;
    noMessages: string;
    selectPrompt: string;
    messagePlaceholder: string;
    send: string;
    loadOlder: string;
    refresh: string;
    unread: string;
    you: string;
    attachments: string;
    fallbackDirect: string;
    fallbackGroup: string;
  };
  statuses: Record<ApplicationStatus, string>;
  organizations: {
    title: string;
    subtitle: string;
    empty: string;
    members: string;
    opportunities: string;
    aboutTitle: string;
    verifiedSince: string;
    trustLevel: string;
    viewOpportunities: string;
    noOpportunities: string;
    allOrganizations: string;
    campaigns: string;
    noCampaigns: string;
    viewCampaigns: string;
    profileSince: string;
    unverifiedNote: string;
    teamTitle: string;
    memberRoles: {
      OWNER: string;
      ADMIN: string;
      MANAGER: string;
      STAFF: string;
      VIEWER: string;
    };
    types: Record<OrganizationType, string>;
  };
  campaigns: {
    title: string;
    subtitle: string;
    empty: string;
    participants: string;
    volunteersTarget: string;
    hoursTarget: string;
    beneficiariesTarget: string;
    aboutTitle: string;
    relatedOpportunities: string;
    join: string;
    leave: string;
    joined: string;
    joinSuccess: string;
    leaveSuccess: string;
    noRelatedOpportunities: string;
    fundingTitle: string;
    raisedLabel: string;
    pendingLabel: string;
    contributorsLabel: string;
    contributeTitle: string;
    contributeAmount: string;
    contributeReference: string;
    contributeReferenceHint: string;
    contributeNote: string;
    contributeSubmit: string;
    contributeSuccess: string;
    contributeLogin: string;
    contributeClosed: string;
    cancelContribution: string;
    contributionCancelled: string;
    bankTransferHint: string;
    contributionStatuses: Record<ContributionStatus, string>;
    statuses: Record<CampaignStatus, string>;
  };
  international: {
    title: string;
    subtitle: string;
    empty: string;
    provider: string;
    program: string;
    duration: string;
    verifiedOnly: string;
    eligibility: string;
    applyLink: string;
    aboutTitle: string;
    hoursLabel: string;
    shareExperience: string;
    experienceTitle: string;
    experienceOrg: string;
    experienceProgram: string;
    experienceActivity: string;
    experienceHours: string;
    experienceUrl: string;
    experienceSent: string;
    experienceEmpty: string;
    myExperiences: string;
    selfDeclared: string;
    // ── BLADNA International (spec §4–§54) ──
    categories: Record<InternationalProjectType, string>;
    statuses: Record<InternationalApplicationStatus, string>;
    verificationStatuses: Record<VerificationStatus, string>;
    sourceLabel: string;
    sourceOfficial: string;
    sourceVerified: string;
    sourceExternal: string;
    countriesTitle: string;
    countriesSubtitle: string;
    countriesEmpty: string;
    countryNotFound: string;
    countryOpps: string;
    countryDuration: string;
    countryRequirements: string;
    officialResources: string;
    visaTitle: string;
    visaDisclaimer: string;
    worldStatsTitle: string;
    worldStatsCountries: string;
    worldStatsPrograms: string;
    worldStatsHours: string;
    backToCountries: string;
    providersTitle: string;
    providersEmpty: string;
    filtersCategory: string;
    filtersCountry: string;
    filterAll: string;
    deadlineLabel: string;
    recommendedTitle: string;
    recommendedEmpty: string;
    recommendedReason: string;
    cityLabel: string;
    regionLabel: string;
    datesLabel: string;
    startDateLabel: string;
    endDateLabel: string;
    ageRangeLabel: string;
    skillsLabel: string;
    languagesLabel: string;
    requirementsLabel: string;
    benefitsTitle: string;
    benefitLabels: {
      accommodation: string;
      food: string;
      transport: string;
      insurance: string;
      visaSupport: string;
      training: string;
      certificate: string;
      fees: string;
      funding: string;
      allowance: string;
      travelSupport: string;
    };
    benefitValues: {
      included: string;
      notIncluded: string;
      unknown: string;
    };
    shareLabel: string;
    copyLink: string;
    linkCopied: string;
    reportLabel: string;
    eligibilityTitle: string;
    eligibilityAge: string;
    eligibilityLanguage: string;
    eligibilityExperience: string;
    eligibilityAvailability: string;
    eligibilityDocuments: string;
    eligEligible: string;
    eligNotEligible: string;
    eligUnknown: string;
    eligNotRequired: string;
    applyTitle: string;
    applyMotivation: string;
    applyLanguages: string;
    applyAvailability: string;
    applyExperience: string;
    applyPassport: string;
    passportReady: string;
    passportInProgress: string;
    passportNone: string;
    applySent: string;
    applyDuplicate: string;
    applyNeedProfile: string;
    applyClosed: string;
    applicationsTitle: string;
    applicationsSubtitle: string;
    applicationDate: string;
    nextActionLabel: string;
    lastUpdateLabel: string;
    applicationsEmpty: string;
    withdrawLabel: string;
    withdrawnOk: string;
    nextActions: Record<InternationalApplicationStatus, string>;
    passportTitle: string;
    passportSubtitle: string;
    countriesVisited: string;
    programsLabel: string;
    verifiedHoursLabel: string;
    passportCertificates: string;
    passportEmpty: string;
    passportDisclaimer: string;
    viewPassport: string;
    dashboardTitle: string;
    travelReady: string;
    emergencyContact: string;
    dateOfBirth: string;
    adminExperiencesTitle: string;
    safetyTitle: string;
    safetySubtitle: string;
    safetyDisclaimer: string;
    safety: {
      scams: { title: string; body: string };
      fake: { title: string; body: string };
      documents: { title: string; body: string };
      payments: { title: string; body: string };
      travel: { title: string; body: string };
      emergency: { title: string; body: string };
      verifySource: { title: string; body: string };
      report: { title: string; body: string };
    };
    adminQueueTitle: string;
    adminQueueEmpty: string;
    adminVerify: string;
    adminNeedsReview: string;
    adminSuspend: string;
    adminReject: string;
    adminNotesLabel: string;
    adminActioned: string;
    adminHistoryTitle: string;
    adminHistoryEmpty: string;
    adminHistoryBy: string;
    adminHistoryAt: string;
    adminApplicationsTitle: string;
    adminApplicationsEmpty: string;
    adminSetStatus: string;
    adminStatusUpdated: string;
    adminExperienceVerify: string;
    adminExperienceVerified: string;
  };
  verify: {
    title: string;
    subtitle: string;
    codeLabel: string;
    codePlaceholder: string;
    submit: string;
    invalid: string;
    invalidHelp: string;
    validTitle: string;
    resultType: string;
    resultHolder: string;
    resultOrganization: string;
    resultHours: string;
    resultVerifiedAt: string;
    allLink: string;
    kinds: {
      certificate: { title: string; hint: string; placeholder: string };
      volunteer: { title: string; hint: string; placeholder: string };
      organization: { title: string; hint: string; placeholder: string };
    };
    types: {
      certificate: string;
      volunteer: string;
      organization: string;
    };
    /** "How verification works" strip on the hub (P12). */
    howTitle: string;
    how: string[];
    faqLink: string;
  };
  billing: {
    title: string;
    subtitle: string;
    orgLabel: string;
    myRole: string;
    noOrgs: string;
    noOrgsCta: string;
    noAccess: string;
    memberRoles: Record<OrgMemberRole, string>;
    subscriptionTitle: string;
    noSubscription: string;
    planLabel: string;
    periodLabel: string;
    cancelLabel: string;
    cancelConfirm: string;
    cancelDone: string;
    cancelAtPeriodEnd: string;
    cancelledOn: string;
    outstandingLabel: string;
    plansTitle: string;
    planActionUpgrade: string;
    planActionDowngrade: string;
    planActionSubscribe: string;
    planActionCurrent: string;
    priceFree: string;
    pricePer: string;
    daysUnit: string;
    tiers: Record<PlanTier, string>;
    statuses: {
      subscription: Record<SubscriptionStatus, string>;
      invoice: Record<InvoiceStatus, string>;
      payment: Record<PaymentStatus, string>;
    };
    methods: Record<PaymentMethod, string>;
    invoicesTitle: string;
    noInvoices: string;
    invoiceNumber: string;
    invoiceDue: string;
    invoiceIssued: string;
    invoicePaid: string;
    invoiceTotal: string;
    invoiceSubtotal: string;
    invoiceTax: string;
    invoiceItems: string;
    invoiceItem: string;
    invoiceQuantity: string;
    invoiceUnitPrice: string;
    invoiceLineTotal: string;
    invoiceFilter: string;
    paymentsTitle: string;
    noPayments: string;
    paymentReference: string;
    paymentOccurred: string;
    recordTitle: string;
    recordHint: string;
    recordInvoiceLabel: string;
    recordMethodLabel: string;
    recordMethodFixed: string;
    recordSubmit: string;
    recordDone: string;
    instructionsTitle: string;
    noInstructions: string;
    detailTitle: string;
    detailBack: string;
  };
  admin: {
    title: string;
    subtitle: string;
    noAccess: string;
    mfaNotice: string;
    actionDone: string;
    reasonLabel: string;
    reasonHint: string;
    reasonRequired: string;
    tabs: {
      users: string;
      organizations: string;
      sponsors: string;
      opportunities: string;
      international: string;
      verification: string;
      reports: string;
      risk: string;
      audit: string;
      content: string;
      settings: string;
      flags: string;
      exports: string;
      billing: string;
    };
    filters: {
      search: string;
      status: string;
      verificationStatus: string;
      organizationType: string;
      action: string;
      entityType: string;
      role: string;
      riskLevel: string;
      apply: string;
      clear: string;
    };
    actions: {
      suspend: string;
      ban: string;
      reinstate: string;
      forceLogout: string;
      publish: string;
      reject: string;
      restore: string;
      review: string;
      decide: string;
      save: string;
      edit: string;
      delete: string;
      confirmDelete: string;
    };
    changeRoleOmitted: string;
    columns: {
      name: string;
      email: string;
      status: string;
      roles: string;
      organization: string;
      trustLevel: string;
      members: string;
      opportunities: string;
      title: string;
      action: string;
      actor: string;
      entity: string;
      ip: string;
      when: string;
      metadata: string;
      score: string;
      level: string;
      reason: string;
      resolution: string;
      decision: string;
      assignedTo: string;
      reporter: string;
      type: string;
      severity: string;
      updatedAt: string;
      joinedAt: string;
      lastLogin: string;
      sessions: string;
    };
    verificationTitle: string;
    legalNameLabel: string;
    evidenceTitle: string;
    evidenceOpen: string;
    evidenceEmpty: string;
    evidenceType: string;
    evidenceSize: string;
    levelLabel: string;
    notesLabel: string;
    rejectReasonLabel: string;
    expiresLabel: string;
    submittedLabel: string;
    documentsLabel: string;
    queueEmpty: string;
    signalsTitle: string;
    incidentsTitle: string;
    settingsKeyLabel: string;
    settingsScopeLabel: string;
    settingsValueLabel: string;
    settingsValueHint: string;
    settingsSaved: string;
    settingsDeleted: string;
    settingsEmpty: string;
    flagsEnabledLabel: string;
    flagsRolloutLabel: string;
    flagsDescriptionLabel: string;
    flagsEffectiveLabel: string;
    flagsEmpty: string;
    roles: Record<SystemRole, string>;
    userStatuses: Record<UserStatus, string>;
    orgStatuses: Record<OrganizationStatus, string>;
    verificationStatuses: Record<VerificationStatus, string>;
    opportunityStatuses: Record<OpportunityStatus, string>;
    trustLevels: Record<TrustLevel, string>;
    riskLevels: Record<RiskLevel, string>;
    incidentStatuses: Record<'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED', string>;
    incidentTypes: Record<
      'SECURITY' | 'FRAUD' | 'ABUSE' | 'SAFETY' | 'MISCONDUCT' | 'OTHER',
      string
    >;
    reportActions: Record<'NONE' | 'RESTRICT' | 'SUSPEND' | 'REMOVE_CONTENT' | 'WARN', string>;
    riskDecisions: Record<'approve' | 'restrict' | 'suspend' | 'override', string>;
    verificationDecisions: Record<
      'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW' | 'REQUEST_INFO',
      string
    >;
    riskTargetTypes: Record<
      'USER' | 'ORGANIZATION' | 'OPPORTUNITY' | 'CAMPAIGN' | 'PAYMENT',
      string
    >;
    reportStatuses: Record<ReportStatus, string>;
    reportReasons: Record<ReportReason, string>;
    reportTargetTypes: Record<ReportTargetType, string>;
    cms: {
      viewPages: string;
      viewAnnouncements: string;
      viewFeatured: string;
      viewHome: string;
      slug: string;
      pageType: string;
      titleAr: string;
      titleFr: string;
      titleEn: string;
      bodyAr: string;
      bodyFr: string;
      bodyEn: string;
      seoDescription: string;
      createPage: string;
      updatePage: string;
      active: string;
      startsAt: string;
      endsAt: string;
      createAnnouncement: string;
      updateAnnouncement: string;
      section: string;
      targetType: string;
      targetId: string;
      position: string;
      sponsored: string;
      label: string;
      createPlacement: string;
      heroTitleAr: string;
      heroTitleFr: string;
      heroTitleEn: string;
      heroSubtitleAr: string;
      heroSubtitleFr: string;
      heroSubtitleEn: string;
      primaryCtaAr: string;
      primaryCtaFr: string;
      primaryCtaEn: string;
      secondaryCtaAr: string;
      secondaryCtaFr: string;
      secondaryCtaEn: string;
      announcementId: string;
      saveHome: string;
      homeEmpty: string;
      pageTypes: Record<'PAGE' | 'FAQ' | 'GUIDE' | 'SAFETY' | 'LEGAL', string>;
      contentStatuses: Record<'DRAFT' | 'PUBLISHED' | 'ARCHIVED', string>;
      placementSections: Record<
        | 'HOME_HERO'
        | 'HOME_FEATURED_OPPORTUNITIES'
        | 'HOME_FEATURED_ORGANIZATIONS'
        | 'HOME_CAMPAIGNS'
        | 'DISCOVER_FEATURED',
        string
      >;
    };
    intl: {
      program: string;
      provider: string;
      city: string;
      duration: string;
      sourceUrl: string;
      create: string;
      update: string;
      hint: string;
    };
    sponsorAdmin: {
      legalName: string;
      commercialName: string;
      contactEmail: string;
      contactPhone: string;
      website: string;
      industry: string;
      create: string;
      statuses: Record<'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', string>;
      statusActions: Record<'ACTIVATE' | 'SUSPEND' | 'ARCHIVE' | 'RESTORE', string>;
    };
    exports: {
      title: string;
      hint: string;
      run: string;
      done: string;
      truncated: string;
      formatLabel: string;
      formats: Record<'json' | 'csv', string>;
      kinds: Record<'VOLUNTEERS' | 'ORGANIZATIONS' | 'CAMPAIGNS' | 'FINANCIAL', string>;
    };
    payments: {
      title: string;
      hint: string;
      invoicesTitle: string;
      subscriptionsTitle: string;
      updateStatus: string;
      newStatus: string;
      updated: string;
      statuses: Record<
        'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED',
        string
      >;
    };
  };
  /**
   * Initiative support console in the org workspace (spec §5/§9/§13/§14):
   * narrative + organizer contact, support-need CRUD, offer decisions and
   * initiative-level impact metrics.
   */
  initiativeConsole: {
    open: string;
    title: string;
    hint: string;
    tabs: {
      narrative: string;
      needs: string;
      offers: string;
      metrics: string;
    };
    tabsLabel: string;
    // Narrative & organizer contact (spec §4)
    narrativeHint: string;
    coverLabel: string;
    contactNameLabel: string;
    contactPhoneLabel: string;
    contactEmailLabel: string;
    contactHint: string;
    tripletRequired: string;
    saved: string;
    // Support needs (spec §13)
    needsEmpty: string;
    addNeed: string;
    needKind: string;
    needDescription: string;
    needQuantityLabel: string;
    needTargetLabel: string;
    needFulfilledLabel: string;
    needCurrency: string;
    needCreate: string;
    needCreated: string;
    needUpdated: string;
    needDeleted: string;
    needDeleteConfirm: string;
    pendingOffers: string;
    // Support offers (spec §13)
    offersTotal: string;
    offersAll: string;
    offerSubmittedAt: string;
    offerDecidedAt: string;
    offersEmpty: string;
    offerFrom: string;
    accept: string;
    reject: string;
    rejectReason: string;
    decideSuccess: string;
    offerStatuses: Record<SupportOfferStatus, string>;
    // Impact metrics (spec §14)
    metricsEmpty: string;
    addMetric: string;
    addMetricDone: string;
    metricType: string;
    metricName: string;
    metricUnit: string;
    metricActual: string;
    metricTarget: string;
    metricSource: string;
    metricTypes: Record<MetricType, string>;
  };
  workspace: {
    title: string;
    subtitle: string;
    /** P31 — honest access panel for a workspace the account cannot open. */
    noAccessTitle: string;
    noAccessBody: string;
    noOrgs: string;
    noOrgsBody: string;
    createOrg: string;
    createOrgDone: string;
    selectOrgHint: string;
    tabs: {
      overview: string;
      opportunities: string;
      applications: string;
      members: string;
      attendance: string;
      hours: string;
      certificates: string;
      documents: string;
      verification: string;
      campaigns: string;
      settings: string;
    };
    overview: {
      /** Pre-title above the analytics panel (SectionHeading eyebrow role). */
      eyebrow: string;
      verifiedHours: string;
      hourRecords: string;
      attendanceRecords: string;
      attendanceVolunteers: string;
      byStatus: string;
      rangeAll: string;
    };
    opportunities: {
      none: string;
      create: string;
      createTitle: string;
      editTitle: string;
      created: string;
      updated: string;
      deleted: string;
      confirmDelete: string;
      transitionHint: string;
      actions: {
        SUBMIT_REVIEW: string;
        PUBLISH: string;
        REJECT: string;
        SUSPEND: string;
        ARCHIVE: string;
        RESTORE_DRAFT: string;
        EXPIRE: string;
      };
      form: {
        titleAr: string;
        titleFr: string;
        titleEn: string;
        descAr: string;
        descFr: string;
        descEn: string;
        type: string;
        locationType: string;
        address: string;
        startDate: string;
        endDate: string;
        deadline: string;
        capacity: string;
        minimumAge: string;
        maximumAge: string;
        estimatedHours: string;
        sourceUrl: string;
        campaign: string;
        campaignNone: string;
        campaignLoadError: string;
        requirements: string;
        addRequirement: string;
        removeRow: string;
        requirementType: string;
        labelAr: string;
        labelFr: string;
        labelEn: string;
        requiredFlag: string;
        benefits: string;
        addBenefit: string;
        benefitType: string;
        benefitValue: string;
        benefitNote: string;
        questions: string;
        addQuestion: string;
        promptAr: string;
        promptFr: string;
        promptEn: string;
        questionType: string;
        options: string;
        optionsHint: string;
      };
    };
    applications: {
      none: string;
      noOpportunities: string;
      filterOpportunity: string;
      selectAll: string;
      selected: string;
      clearSelection: string;
      markAccepted: string;
      markRejected: string;
      confirmAccept: string;
      confirmReject: string;
      updated: string;
      noteLabel: string;
      coverLetter: string;
      appliedOn: string;
      bulkHint: string;
      opportunityColumn: string;
    };
    members: {
      none: string;
      inviteTitle: string;
      invite: string;
      inviteSent: string;
      emailLabel: string;
      roleLabel: string;
      remove: string;
      confirmRemove: string;
      removed: string;
      pendingInvites: string;
      noPendingInvites: string;
      revokeInvite: string;
      inviteRevoked: string;
      expiresAt: string;
      roles: Record<'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER', string>;
      statuses: Record<'ACTIVE' | 'SUSPENDED' | 'REMOVED', string>;
    };
    attendance: {
      none: string;
      createSession: string;
      name: string;
      opportunity: string;
      startsAt: string;
      expiresAt: string;
      ttlSeconds: string;
      created: string;
      showQr: string;
      qrHint: string;
      copyLink: string;
      linkCopied: string;
      reissue: string;
      reissued: string;
      revoke: string;
      revoked: string;
      confirmRevoke: string;
      manualTitle: string;
      manualSubmit: string;
      manualDone: string;
      volunteerLabel: string;
      dateLabel: string;
      hoursLabel: string;
      noteLabel: string;
      reasonLabel: string;
      records: string;
      confirmRow: string;
      rejectRow: string;
      confirmed: string;
      rejected: string;
      noOpportunities: string;
      statuses: Record<'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED' | 'ABSENT', string>;
    };
    hours: {
      none: string;
      verify: string;
      reject: string;
      revoke: string;
      verifySelected: string;
      rejectSelected: string;
      reasonOptional: string;
      verified: string;
      rejected: string;
      revoked: string;
      confirmRevoke: string;
      selectHint: string;
      selected: string;
      volunteerLabel: string;
      dateLabel: string;
      evidenceLabel: string;
      statuses: Record<'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED', string>;
    };
    certificates: {
      none: string;
      issue: string;
      issueTitle: string;
      issued: string;
      revoke: string;
      revoked: string;
      confirmRevoke: string;
      reasonLabel: string;
      title: string;
      hoursLabel: string;
      fromHour: string;
      noEligibleHours: string;
      statuses: Record<'VALID' | 'REVOKED' | 'EXPIRED', string>;
    };
    documents: {
      none: string;
      uploadTitle: string;
      upload: string;
      uploaded: string;
      delete: string;
      deleted: string;
      confirmDelete: string;
      fileName: string;
      chooseFile: string;
      typeLabel: string;
      visibilityLabel: string;
      hint: string;
    };
    verification: {
      title: string;
      submit: string;
      submitted: string;
      levelLabel: string;
      notesLabel: string;
      documentIdsHint: string;
      historyTitle: string;
      none: string;
      noDocuments: string;
      levels: Record<
        | 'LEVEL_0_UNVERIFIED'
        | 'LEVEL_1_BASIC_VERIFIED'
        | 'LEVEL_2_ORGANIZATION_VERIFIED'
        | 'LEVEL_3_TRUSTED_PARTNER'
        | 'LEVEL_4_STRATEGIC_PARTNER',
        string
      >;
    };
    campaigns: {
      none: string;
      create: string;
      createTitle: string;
      created: string;
      editTitle: string;
      updated: string;
      transitionHint: string;
      nameLabel: string;
      descriptionLabel: string;
      goalLabel: string;
      startLabel: string;
      endLabel: string;
      volunteerTargetLabel: string;
      hourTargetLabel: string;
      beneficiaryTargetLabel: string;
      budgetLabel: string;
      currencyLabel: string;
      reasonLabel: string;
      contributions: string;
      noContributions: string;
      contributionDonor: string;
      contributionAmount: string;
      contributionStatuses: Record<ContributionStatus, string>;
      confirmAction: string;
      rejectAction: string;
      contributionReason: string;
      contributionUpdated: string;
      actions: Record<'ACTIVATE' | 'PAUSE' | 'COMPLETE' | 'CANCEL' | 'ARCHIVE', string>;
    };
    settings: {
      saved: string;
      nameLabel: string;
      legalName: string;
      descriptionLabel: string;
      websiteLabel: string;
      emailLabel: string;
      phoneLabel: string;
      wilayaLabel: string;
      cityLabel: string;
      addressLabel: string;
      logoLabel: string;
      coverLabel: string;
      typeLabel: string;
    };
  };
  sponsorConsole: {
    title: string;
    subtitle: string;
    noWorkspaces: string;
    noWorkspacesBody: string;
    register: string;
    registerTitle: string;
    registered: string;
    switchLabel: string;
    tabs: {
      overview: string;
      profile: string;
      sponsorships: string;
      programs: string;
      members: string;
    };
    overview: {
      statSponsorships: string;
      statPrograms: string;
      statStatus: string;
      empty: string;
    };
    profile: {
      saved: string;
    };
    sponsorships: {
      none: string;
      create: string;
      createTitle: string;
      created: string;
      updated: string;
      amountLabel: string;
      currencyLabel: string;
      startLabel: string;
      endLabel: string;
      campaignLabel: string;
      programLabel: string;
      targetHint: string;
      kindLabel: string;
      kinds: Record<SponsorshipKind, string>;
      descriptionLabel: string;
      inKindHint: string;
      reasonLabel: string;
      transitionHint: string;
      actions: Record<'ACTIVATE' | 'COMPLETE' | 'CANCEL', string>;
      statuses: Record<'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED', string>;
    };
    programs: {
      none: string;
      create: string;
      createTitle: string;
      created: string;
      editTitle: string;
      updated: string;
      titleLabel: string;
      descriptionLabel: string;
      budgetLabel: string;
      startLabel: string;
      endLabel: string;
      volunteerTargetLabel: string;
      hourTargetLabel: string;
      beneficiaryTargetLabel: string;
      impactTargetLabel: string;
      reasonLabel: string;
      transitionHint: string;
      actions: Record<'ACTIVATE' | 'PAUSE' | 'COMPLETE' | 'ARCHIVE', string>;
      statuses: Record<'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED', string>;
    };
    members: {
      none: string;
      invite: string;
      inviteSent: string;
      emailLabel: string;
      roleLabel: string;
      remove: string;
      confirmRemove: string;
      removed: string;
      roles: Record<'SPONSOR_MEMBER' | 'SPONSOR_ADMIN', string>;
    };
  };
  checkin: {
    title: string;
    subtitle: string;
    checkIn: string;
    checking: string;
    success: string;
    already: string;
    missingToken: string;
    missingTokenBody: string;
  };
  help: {
    title: string;
    subtitle: string;
    empty: string;
    emptyBody: string;
    updated: string;
    allArticles: string;
    types: {
      PAGE: string;
      FAQ: string;
      GUIDE: string;
      SAFETY: string;
      LEGAL: string;
    };
  };
  announcements: {
    /** Landmark name for the site-wide banner (P12). */
    label: string;
    dismiss: string;
  };
  featured: {
    eyebrow: string;
    title: string;
    body: string;
    /** Shown when a placement is sponsored but carries no custom label. */
    sponsored: string;
    kinds: {
      OPPORTUNITY: string;
      ORGANIZATION: string;
      CAMPAIGN: string;
    };
  };
  legal: {
    terms: {
      title: string;
      intro: string;
      updated: string;
      sections: LegalSection[];
    };
    privacy: {
      title: string;
      intro: string;
      updated: string;
      sections: LegalSection[];
    };
  };
  errors: {
    generic: string;
    network: string;
    unauthorized: string;
    forbidden: string;
    notFound: string;
    conflict: string;
    rateLimited: string;
    validation: string;
    mfaRequired: string;
    businessRule: string;
    config: string;
    notImplemented: string;
  };
}

export const LOCALES: readonly LocaleCode[] = ['ar', 'fr', 'en'];
export const DEFAULT_LOCALE: LocaleCode = 'ar';
