import { relations } from "drizzle-orm/relations";
import { users, userSettings, orgunitTypes, orgunits, memberTypes, persons, projects, lectureTypes, lectures, publications, pressReleases, publicationEmbeddings, publicationTypes, reviewSessions, pressReleaseEmbeddings, personOestat6, oestat6Categories, lecturePersons, lectureOrgunits, publicationProjects, projectLectures, extunits, extunitPersons, orgunitPublications, personPublications, orgunitPersons, socialChannels, socialPosts } from "./schema";

export const socialChannelsRelations = relations(socialChannels, ({many}) => ({
	socialPosts: many(socialPosts),
}));

export const socialPostsRelations = relations(socialPosts, ({one}) => ({
	socialChannel: one(socialChannels, {
		fields: [socialPosts.channelId],
		references: [socialChannels.id],
	}),
}));

export const userSettingsRelations = relations(userSettings, ({one}) => ({
	user: one(users, {
		fields: [userSettings.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	userSettings: many(userSettings),
}));

export const orgunitsRelations = relations(orgunits, ({one, many}) => ({
	orgunitType: one(orgunitTypes, {
		fields: [orgunits.typeId],
		references: [orgunitTypes.id]
	}),
	orgunit: one(orgunits, {
		fields: [orgunits.parentId],
		references: [orgunits.id],
		relationName: "orgunits_parentId_orgunits_id"
	}),
	orgunits: many(orgunits, {
		relationName: "orgunits_parentId_orgunits_id"
	}),
	lectureOrgunits: many(lectureOrgunits),
	orgunitPublications: many(orgunitPublications),
	orgunitPersons: many(orgunitPersons),
}));

export const orgunitTypesRelations = relations(orgunitTypes, ({many}) => ({
	orgunits: many(orgunits),
}));

export const personsRelations = relations(persons, ({one, many}) => ({
	memberType: one(memberTypes, {
		fields: [persons.memberTypeId],
		references: [memberTypes.id]
	}),
	personOestat6s: many(personOestat6),
	lecturePersons: many(lecturePersons),
	extunitPersons: many(extunitPersons),
	personPublications: many(personPublications),
	orgunitPersons: many(orgunitPersons),
}));

export const memberTypesRelations = relations(memberTypes, ({many}) => ({
	persons: many(persons),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	project: one(projects, {
		fields: [projects.parentId],
		references: [projects.id],
		relationName: "projects_parentId_projects_id"
	}),
	projects: many(projects, {
		relationName: "projects_parentId_projects_id"
	}),
	publicationProjects: many(publicationProjects),
	projectLectures: many(projectLectures),
}));

export const lecturesRelations = relations(lectures, ({one, many}) => ({
	lectureType: one(lectureTypes, {
		fields: [lectures.typeId],
		references: [lectureTypes.id]
	}),
	lecturePersons: many(lecturePersons),
	lectureOrgunits: many(lectureOrgunits),
	projectLectures: many(projectLectures),
}));

export const lectureTypesRelations = relations(lectureTypes, ({many}) => ({
	lectures: many(lectures),
}));

export const pressReleasesRelations = relations(pressReleases, ({one, many}) => ({
	publication: one(publications, {
		fields: [pressReleases.publicationId],
		references: [publications.id]
	}),
	pressReleaseEmbeddings: many(pressReleaseEmbeddings),
}));

export const publicationsRelations = relations(publications, ({one, many}) => ({
	pressReleases: many(pressReleases),
	publicationEmbeddings: many(publicationEmbeddings),
	// Named `publicationTypeRef` instead of `publicationType` because the
	// publications table already has a text column called `publication_type`
	// (denormalised name copy from the FK target). A same-named relation
	// shadows the column in `db.query.publications.findX` results —
	// row.publicationType would become the joined row object instead of the
	// text scalar, so `publication_type` in the wire shape would render as
	// `{nameDe, nameEn}` (React rejects it as a child). With the suffix,
	// row.publicationType keeps the text scalar; row.publicationTypeRef
	// carries the joined publication_types row.
	publicationTypeRef: one(publicationTypes, {
		fields: [publications.publicationTypeId],
		references: [publicationTypes.id]
	}),
	reviewSession: one(reviewSessions, {
		fields: [publications.decidedInSession],
		references: [reviewSessions.id]
	}),
	publicationProjects: many(publicationProjects),
	orgunitPublications: many(orgunitPublications),
	personPublications: many(personPublications),
}));

export const publicationEmbeddingsRelations = relations(publicationEmbeddings, ({one}) => ({
	publication: one(publications, {
		fields: [publicationEmbeddings.publicationId],
		references: [publications.id]
	}),
}));

export const publicationTypesRelations = relations(publicationTypes, ({many}) => ({
	publications: many(publications),
}));

export const reviewSessionsRelations = relations(reviewSessions, ({many}) => ({
	publications: many(publications),
}));

export const pressReleaseEmbeddingsRelations = relations(pressReleaseEmbeddings, ({one}) => ({
	pressRelease: one(pressReleases, {
		fields: [pressReleaseEmbeddings.pressReleaseId],
		references: [pressReleases.id]
	}),
}));

export const personOestat6Relations = relations(personOestat6, ({one}) => ({
	person: one(persons, {
		fields: [personOestat6.personId],
		references: [persons.id]
	}),
	oestat6Category: one(oestat6Categories, {
		fields: [personOestat6.oestat6Id],
		references: [oestat6Categories.id]
	}),
}));

export const oestat6CategoriesRelations = relations(oestat6Categories, ({many}) => ({
	personOestat6s: many(personOestat6),
}));

export const lecturePersonsRelations = relations(lecturePersons, ({one}) => ({
	lecture: one(lectures, {
		fields: [lecturePersons.lectureId],
		references: [lectures.id]
	}),
	person: one(persons, {
		fields: [lecturePersons.personId],
		references: [persons.id]
	}),
}));

export const lectureOrgunitsRelations = relations(lectureOrgunits, ({one}) => ({
	lecture: one(lectures, {
		fields: [lectureOrgunits.lectureId],
		references: [lectures.id]
	}),
	orgunit: one(orgunits, {
		fields: [lectureOrgunits.orgunitId],
		references: [orgunits.id]
	}),
}));

export const publicationProjectsRelations = relations(publicationProjects, ({one}) => ({
	publication: one(publications, {
		fields: [publicationProjects.publicationId],
		references: [publications.id]
	}),
	project: one(projects, {
		fields: [publicationProjects.projectId],
		references: [projects.id]
	}),
}));

export const projectLecturesRelations = relations(projectLectures, ({one}) => ({
	project: one(projects, {
		fields: [projectLectures.projectId],
		references: [projects.id]
	}),
	lecture: one(lectures, {
		fields: [projectLectures.lectureId],
		references: [lectures.id]
	}),
}));

export const extunitPersonsRelations = relations(extunitPersons, ({one}) => ({
	extunit: one(extunits, {
		fields: [extunitPersons.extunitId],
		references: [extunits.id]
	}),
	person: one(persons, {
		fields: [extunitPersons.personId],
		references: [persons.id]
	}),
}));

export const extunitsRelations = relations(extunits, ({many}) => ({
	extunitPersons: many(extunitPersons),
}));

export const orgunitPublicationsRelations = relations(orgunitPublications, ({one}) => ({
	orgunit: one(orgunits, {
		fields: [orgunitPublications.orgunitId],
		references: [orgunits.id]
	}),
	publication: one(publications, {
		fields: [orgunitPublications.publicationId],
		references: [publications.id]
	}),
}));

export const personPublicationsRelations = relations(personPublications, ({one}) => ({
	person: one(persons, {
		fields: [personPublications.personId],
		references: [persons.id]
	}),
	publication: one(publications, {
		fields: [personPublications.publicationId],
		references: [publications.id]
	}),
}));

export const orgunitPersonsRelations = relations(orgunitPersons, ({one}) => ({
	orgunit: one(orgunits, {
		fields: [orgunitPersons.orgunitId],
		references: [orgunits.id]
	}),
	person: one(persons, {
		fields: [orgunitPersons.personId],
		references: [persons.id]
	}),
}));