/**
 * Base entreprise : identité, identifiants légaux (selon pays), assurances,
 * certifications, références, équipe, matériel, documents administratifs,
 * signataire. Ces données alimentent automatiquement tous les documents
 * générés (mémoire technique, réponse administrative…).
 */

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import {
  Field,
  GuideBanner,
  PageHeader,
  SecondaryButton,
  SectionCard,
  TextArea,
  TextInput,
  WarningBanner,
} from '../components/ui';
import { can, formatDate, uid } from '../types';

const TABS = [
  { id: 'identite', label: 'Identité' },
  { id: 'assurances', label: 'Assurances & certifications' },
  { id: 'references', label: 'Références' },
  { id: 'equipe', label: 'Équipe' },
  { id: 'materiel', label: 'Matériel' },
  { id: 'docs', label: 'Documents administratifs' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function CompanyPage() {
  const company = useTendersStore((s) => s.company);
  const updateCompany = useTendersStore((s) => s.updateCompany);
  const role = useTendersStore((s) => s.settings.currentUserRole);
  const [tab, setTab] = useState<TabId>('identite');

  const editable = can(role, 'manage_company');
  const expiredDocs = company.adminDocs.filter(
    (d) => d.available && new Date(d.validUntil) < new Date(),
  );

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Base entreprise"
        description="Renseignez une fois vos informations : elles sont reprises automatiquement dans tous les documents générés."
      />

      {!editable && (
        <GuideBanner>
          Lecture seule — seul un Administrateur peut modifier la Base entreprise (votre rôle : {role}).
        </GuideBanner>
      )}

      {expiredDocs.length > 0 && (
        <WarningBanner>
          ⚠ {expiredDocs.length} document(s) administratif(s) expiré(s) :{' '}
          {expiredDocs.map((d) => d.name).join(' · ')} — pensez à les renouveler avant votre
          prochain dépôt.
        </WarningBanner>
      )}

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium ${
                tab === t.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'identite' && (
        <div className="space-y-6">
          <SectionCard title="Identité de l'entreprise">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Raison sociale">
                <TextInput
                  value={company.name}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ name: e.target.value })}
                />
              </Field>
              <Field label="Forme juridique / capital">
                <TextInput
                  value={company.legalForm}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ legalForm: e.target.value })}
                />
              </Field>
              <Field label="Adresse">
                <TextInput
                  value={company.address}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ address: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ville">
                  <TextInput
                    value={company.city}
                    disabled={!editable}
                    onChange={(e) => updateCompany({ city: e.target.value })}
                  />
                </Field>
                <Field label="Pays">
                  <TextInput
                    value={company.country}
                    disabled={!editable}
                    onChange={(e) => updateCompany({ country: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Téléphone">
                <TextInput
                  value={company.phone}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <TextInput
                  value={company.email}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ email: e.target.value })}
                />
              </Field>
              <Field label="Site web">
                <TextInput
                  value={company.website}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ website: e.target.value })}
                />
              </Field>
              <Field label="Effectif">
                <TextInput
                  value={company.employees}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ employees: e.target.value })}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Identifiants légaux"
            hint="Selon votre pays : ICE / RC / IF / CNSS (Maroc), SIRET / TVA (France)…"
          >
            <div className="space-y-3">
              {company.registrationIds.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput
                    value={r.label}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        registrationIds: company.registrationIds.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    className="!w-40 shrink-0"
                    placeholder="ICE, SIRET…"
                  />
                  <TextInput
                    value={r.value}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        registrationIds: company.registrationIds.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="Numéro"
                  />
                  {editable && (
                    <button
                      type="button"
                      onClick={() =>
                        updateCompany({
                          registrationIds: company.registrationIds.filter((_, j) => j !== i),
                        })
                      }
                      className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      aria-label="Supprimer l'identifiant"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {editable && (
                <SecondaryButton
                  onClick={() =>
                    updateCompany({
                      registrationIds: [...company.registrationIds, { label: '', value: '' }],
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> Ajouter un identifiant
                </SecondaryButton>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Présentation de l'entreprise"
            hint="Ce texte ouvre vos mémoires techniques — soignez-le."
          >
            <TextArea
              value={company.presentation}
              disabled={!editable}
              onChange={(e) => updateCompany({ presentation: e.target.value })}
              rows={6}
            />
          </SectionCard>

          <SectionCard title="Signataire des documents">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nom du signataire">
                <TextInput
                  value={company.signatoryName}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ signatoryName: e.target.value })}
                />
              </Field>
              <Field label="Fonction">
                <TextInput
                  value={company.signatoryRole}
                  disabled={!editable}
                  onChange={(e) => updateCompany({ signatoryRole: e.target.value })}
                />
              </Field>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === 'assurances' && (
        <div className="space-y-6">
          <SectionCard title="Assurances" hint="Reprises dans la réponse administrative.">
            <TextArea
              value={company.insurances}
              disabled={!editable}
              onChange={(e) => updateCompany({ insurances: e.target.value })}
              rows={5}
              placeholder="RC professionnelle, tous risques chantier, décennale… avec n° de police."
            />
          </SectionCard>

          <SectionCard title="Certifications & qualifications">
            <div className="space-y-3">
              {company.certifications.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  <TextInput
                    value={c.name}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        certifications: company.certifications.map((x) =>
                          x.id === c.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                    className="min-w-[220px] flex-1"
                    placeholder="Nom (ISO 9001, qualification…)"
                  />
                  <TextInput
                    value={c.issuer}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        certifications: company.certifications.map((x) =>
                          x.id === c.id ? { ...x, issuer: e.target.value } : x,
                        ),
                      })
                    }
                    className="!w-52 shrink-0"
                    placeholder="Organisme"
                  />
                  <TextInput
                    type="date"
                    value={c.validUntil.slice(0, 10)}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        certifications: company.certifications.map((x) =>
                          x.id === c.id ? { ...x, validUntil: e.target.value } : x,
                        ),
                      })
                    }
                    className="!w-40 shrink-0"
                    title="Valide jusqu'au"
                  />
                  {editable && (
                    <button
                      type="button"
                      onClick={() =>
                        updateCompany({
                          certifications: company.certifications.filter((x) => x.id !== c.id),
                        })
                      }
                      className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {editable && (
                <SecondaryButton
                  onClick={() =>
                    updateCompany({
                      certifications: [
                        ...company.certifications,
                        { id: uid('cert'), name: '', issuer: '', validUntil: new Date().toISOString() },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> Ajouter une certification
                </SecondaryButton>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {tab === 'references' && (
        <SectionCard
          title="Références projets / chantiers"
          hint="Les 3 plus pertinentes sont reprises automatiquement dans le mémoire technique."
        >
          <div className="space-y-4">
            {company.references.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Titre de l'opération">
                    <TextInput
                      value={r.title}
                      disabled={!editable}
                      onChange={(e) =>
                        updateCompany({
                          references: company.references.map((x) =>
                            x.id === r.id ? { ...x, title: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Client / maître d'ouvrage">
                    <TextInput
                      value={r.client}
                      disabled={!editable}
                      onChange={(e) =>
                        updateCompany({
                          references: company.references.map((x) =>
                            x.id === r.id ? { ...x, client: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Année">
                      <TextInput
                        value={r.year}
                        disabled={!editable}
                        onChange={(e) =>
                          updateCompany({
                            references: company.references.map((x) =>
                              x.id === r.id ? { ...x, year: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Montant">
                      <TextInput
                        value={r.amount}
                        disabled={!editable}
                        onChange={(e) =>
                          updateCompany({
                            references: company.references.map((x) =>
                              x.id === r.id ? { ...x, amount: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Description / résultats">
                    <TextArea
                      value={r.description}
                      disabled={!editable}
                      rows={2}
                      onChange={(e) =>
                        updateCompany({
                          references: company.references.map((x) =>
                            x.id === r.id ? { ...x, description: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() =>
                      updateCompany({
                        references: company.references.filter((x) => x.id !== r.id),
                      })
                    }
                    className="mt-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer cette référence
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <SecondaryButton
                onClick={() =>
                  updateCompany({
                    references: [
                      ...company.references,
                      { id: uid('ref'), title: '', client: '', year: '', amount: '', description: '' },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Ajouter une référence
              </SecondaryButton>
            )}
          </div>
        </SectionCard>
      )}

      {tab === 'equipe' && (
        <SectionCard
          title="Profils clés"
          hint="Repris dans la section « Moyens humains » des mémoires techniques."
        >
          <div className="space-y-3">
            {company.team.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={m.name}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      team: company.team.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)),
                    })
                  }
                  className="min-w-[160px] flex-1"
                  placeholder="Nom"
                />
                <TextInput
                  value={m.role}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      team: company.team.map((x) => (x.id === m.id ? { ...x, role: e.target.value } : x)),
                    })
                  }
                  className="!w-56 shrink-0"
                  placeholder="Rôle"
                />
                <TextInput
                  value={m.experience}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      team: company.team.map((x) =>
                        x.id === m.id ? { ...x, experience: e.target.value } : x,
                      ),
                    })
                  }
                  className="!w-28 shrink-0"
                  placeholder="Exp."
                />
                <TextInput
                  value={m.qualifications}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      team: company.team.map((x) =>
                        x.id === m.id ? { ...x, qualifications: e.target.value } : x,
                      ),
                    })
                  }
                  className="min-w-[200px] flex-1"
                  placeholder="Diplômes, habilitations"
                />
                {editable && (
                  <button
                    type="button"
                    onClick={() => updateCompany({ team: company.team.filter((x) => x.id !== m.id) })}
                    className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <SecondaryButton
                onClick={() =>
                  updateCompany({
                    team: [
                      ...company.team,
                      { id: uid('tm'), name: '', role: '', experience: '', qualifications: '' },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Ajouter un profil
              </SecondaryButton>
            )}
          </div>
        </SectionCard>
      )}

      {tab === 'materiel' && (
        <SectionCard
          title="Moyens matériels"
          hint="Repris dans la section « Moyens matériels » des mémoires techniques."
        >
          <div className="space-y-3">
            {company.equipment.map((eq) => (
              <div key={eq.id} className="flex flex-wrap items-center gap-2">
                <TextInput
                  type="number"
                  min={0}
                  value={eq.quantity}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      equipment: company.equipment.map((x) =>
                        x.id === eq.id ? { ...x, quantity: Number(e.target.value) } : x,
                      ),
                    })
                  }
                  className="!w-20 shrink-0"
                />
                <TextInput
                  value={eq.name}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      equipment: company.equipment.map((x) =>
                        x.id === eq.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  className="min-w-[220px] flex-1"
                  placeholder="Désignation"
                />
                <TextInput
                  value={eq.note}
                  disabled={!editable}
                  onChange={(e) =>
                    updateCompany({
                      equipment: company.equipment.map((x) =>
                        x.id === eq.id ? { ...x, note: e.target.value } : x,
                      ),
                    })
                  }
                  className="min-w-[160px] flex-1"
                  placeholder="Note (option, capacité…)"
                />
                {editable && (
                  <button
                    type="button"
                    onClick={() =>
                      updateCompany({ equipment: company.equipment.filter((x) => x.id !== eq.id) })
                    }
                    className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <SecondaryButton
                onClick={() =>
                  updateCompany({
                    equipment: [...company.equipment, { id: uid('eq'), name: '', quantity: 1, note: '' }],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Ajouter un matériel
              </SecondaryButton>
            )}
          </div>
        </SectionCard>
      )}

      {tab === 'docs' && (
        <SectionCard
          title="Documents administratifs"
          hint="Attestations et pièces récurrentes des dossiers. L'application vous alerte quand une pièce expire."
        >
          <div className="space-y-3">
            {company.adminDocs.map((d) => {
              const expired = d.available && new Date(d.validUntil) < new Date();
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.available}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        adminDocs: company.adminDocs.map((x) =>
                          x.id === d.id ? { ...x, available: e.target.checked } : x,
                        ),
                      })
                    }
                    className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600"
                    title="Pièce disponible"
                  />
                  <TextInput
                    value={d.name}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        adminDocs: company.adminDocs.map((x) =>
                          x.id === d.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                    className="min-w-[200px] flex-1"
                    placeholder="Nom de la pièce"
                  />
                  <TextInput
                    value={d.kind}
                    disabled={!editable}
                    onChange={(e) =>
                      updateCompany({
                        adminDocs: company.adminDocs.map((x) =>
                          x.id === d.id ? { ...x, kind: e.target.value } : x,
                        ),
                      })
                    }
                    className="!w-40 shrink-0"
                    placeholder="Type"
                  />
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      type="date"
                      value={d.validUntil.slice(0, 10)}
                      disabled={!editable}
                      onChange={(e) =>
                        updateCompany({
                          adminDocs: company.adminDocs.map((x) =>
                            x.id === d.id ? { ...x, validUntil: e.target.value } : x,
                          ),
                        })
                      }
                      className={`!w-40 shrink-0 ${expired ? '!border-red-400' : ''}`}
                      title="Valide jusqu'au"
                    />
                    {expired && (
                      <span className="text-xs font-semibold text-red-600">
                        Expirée le {formatDate(d.validUntil)}
                      </span>
                    )}
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() =>
                        updateCompany({ adminDocs: company.adminDocs.filter((x) => x.id !== d.id) })
                      }
                      className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {editable && (
              <SecondaryButton
                onClick={() =>
                  updateCompany({
                    adminDocs: [
                      ...company.adminDocs,
                      {
                        id: uid('ad'),
                        name: '',
                        kind: '',
                        validUntil: new Date().toISOString(),
                        available: true,
                      },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Ajouter un document
              </SecondaryButton>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
