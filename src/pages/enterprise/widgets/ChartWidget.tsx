import { Widget } from '../types';
import React from 'react';
import { iconMap } from './iconMap';
import SalesEvolutionWidgetEnriched from '../../../components/SalesEvolutionWidgetEnriched';
import { EquipmentAvailabilityWidget } from './EquipmentAvailabilityWidget';
import { getInterventionsByStatus } from '../../../utils/enterpriseApi';
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Package, PieChart } from 'lucide-react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const ChartWidget = ({
  widget,
  data,
  onShowDetails,
  onShowInterventionForm
}: {
  widget: Widget;
  data: any;
  onShowDetails: (content: React.ReactNode) => void;
  onShowInterventionForm: () => void;
}) => {
  const { formatCurrency } = useWidgetMadCurrency();
  const IconComponent = typeof widget.icon === 'string' ? iconMap[widget.icon] : widget.icon;

  const renderChart = () => {
    switch (widget.id) {
        case 'sales-chart':
            return <SalesEvolutionWidgetEnriched />;

        case 'equipment-availability':
            return <EquipmentAvailabilityWidget data={data} />;

        case 'interventions-today':
            // S'assurer que les données sont un tableau valide avant de continuer
            if (!data || !Array.isArray(data) || data.length === 0) {
              return <div className="text-center text-gray-500 py-4">Aucune intervention aujourd'hui.</div>;
            }

            // CORRECTION: Extraire les valeurs du tableau au lieu de déstructurer un objet
            const completed = data.find(item => item.name === 'Terminé')?.value || 0;
            const pending = data.find(item => item.name === 'En attente')?.value || 0;
            const total = completed + pending;
            const COLORS = ['#22c55e', '#f97316'];

            const handleDonutClick = async (status: 'Terminé' | 'En attente') => {
              onShowDetails(<div>Chargement des détails...</div>);
              try {
                const interventions = await getInterventionsByStatus(status);
                onShowDetails(
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold">Interventions "{status}" du jour</h3>
                      <button
                        onClick={onShowInterventionForm}
                        className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors"
                      >
                        + Nouvelle intervention
                      </button>
                    </div>
                    {interventions.length > 0 ? (
                      <ul className="space-y-3">
                        {interventions.map((item: any) => (
                          <li key={item.id} className="p-2 border rounded-md">
                            <p className="font-semibold">{item.equipment.name}</p>
                            <p className="text-sm text-gray-600">{item.description}</p>
                            <div className="text-xs text-gray-500 mt-1">
                              <span>Priorité: {item.priority}</span>
                              <span className="mx-2">|</span>
                              <span>Technicien: {item.technician ? item.technician.name : 'Non assigné'}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Aucune intervention avec ce statut pour aujourd'hui.</p>
                    )}
                  </div>
                );
              } catch (error) {
                console.error("Erreur lors de la récupération des détails d'intervention", error);
                onShowDetails(<div>Erreur lors du chargement des détails.</div>);
              }
            };

            return (
                <div className="space-y-4">
                    <div className="relative w-full h-40 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={data}
                                     dataKey="value" nameKey="name" cx="50%" cy="50%"
                                     innerRadius={40} outerRadius={60}
                                     paddingAngle={5}
                                >
                                  {data.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={COLORS[index % COLORS.length]}
                                      className="cursor-pointer transition-opacity hover:opacity-80"
                                      onClick={() => handleDonutClick(entry.name as 'Terminé' | 'En attente')}
                                    />
                                  ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-gray-800">{total}</span>
                            <span className="text-sm text-gray-500">Total</span>
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <button
                            onClick={onShowInterventionForm}
                            className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
                        >
                            + Nouvelle intervention
                        </button>
                    </div>
                </div>
            );

        case 'technician-workload':
            const detailedWorkloadView = (
              <div>
                <h3 className="text-xl font-semibold mb-4">Charge de travail détaillée</h3>
                <div className="space-y-3">
                  {data.map((tech: any, index: number) => (
                    <div key={index} className="p-2 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-sm font-medium">{tech.name}</div>
                        <div className="text-xs text-gray-600">{tech.current_hours}h / {tech.max_hours}h</div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                        <div
                          className={`h-2 rounded-full ${tech.workload_percentage > 80 ? 'bg-red-500' : tech.workload_percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${tech.workload_percentage}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Efficacité: {(tech.efficiency * 100).toFixed(0)}%</span>
                        <span>{tech.tasks_count} tâches</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );

            return (
              <div className="space-y-3">
                {data.map((tech: any, index: number) => (
                  <div key={index} className="p-2 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <div className="text-sm font-medium">{tech.name}</div>
                      <div className="text-xs text-gray-600">{tech.current_hours}h / {tech.max_hours}h</div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                      <div
                        className={`h-2 rounded-full ${tech.workload_percentage > 80 ? 'bg-red-500' : tech.workload_percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${tech.workload_percentage}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Efficacité: {(tech.efficiency * 100).toFixed(0)}%</span>
                      <span>{tech.tasks_count} tâches</span>
                    </div>
                  </div>
                ))}
                {data.length > 4 && (
                  <button onClick={() => onShowDetails(detailedWorkloadView)} className="w-full mt-2 text-sm text-orange-600 hover:text-orange-700 font-semibold">
                    Voir tout
                  </button>
                )}
              </div>
            );

        case 'parts-inventory':
            const detailedInventoryView = (
                    <div>
                <h3 className="text-xl font-semibold mb-4">État du stock détaillé</h3>

                {/* Graphique interactif */}
                <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
                  <h4 className="text-lg font-medium mb-3 text-gray-800">Vue d'ensemble du stock</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="category"
                          tick={{ fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #ccc',
                            borderRadius: '8px'
                          }}
                          formatter={(value: any, name: any) => [
                            `${value} unités`,
                            name === 'stock' ? 'Stock actuel' : name === 'min' ? 'Minimum' : 'Maximum'
                          ]}
                        />
                        <Legend />
                        <Bar
                          dataKey="stock"
                          fill="#3b82f6"
                          name="Stock actuel"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="min"
                          fill="#f59e0b"
                          name="Niveau minimum"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="critical_level"
                          fill="#ef4444"
                          name="Niveau critique"
                          radius={[4, 4, 0, 0]}
                        />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                    </div>
                  </div>

                <div className="space-y-3">
                  {data.map((item: any, index: number) => {
                    const stockPercentage = Math.min((item.stock / item.max) * 100, 100);
                    const criticalPercentage = (item.critical_level / item.max) * 100;
                    const minPercentage = (item.min / item.max) * 100;

                    let barColor = 'bg-green-500';
                    let statusColor = 'bg-green-100 text-green-800';
                    let statusText = 'Stock OK';
                    let alertIcon = '✅';

                    if (item.stock < item.critical_level) {
                      barColor = 'bg-red-500';
                      statusColor = 'bg-red-100 text-red-800';
                      statusText = 'CRITIQUE';
                      alertIcon = '🚨';
                    } else if (item.stock < item.min) {
                      barColor = 'bg-orange-500';
                      statusColor = 'bg-orange-100 text-orange-800';
                      statusText = 'Stock faible';
                      alertIcon = '⚠️';
                    } else if (item.stock < item.min * 1.2) {
                      barColor = 'bg-yellow-500';
                      statusColor = 'bg-yellow-100 text-yellow-800';
                      statusText = 'Attention';
                      alertIcon = '⚡';
                    }

                    return (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{alertIcon}</span>
                            <div className="font-semibold text-gray-900">{item.category}</div>
                          </div>
                          <div className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor}`}>
                            {statusText}
                          </div>
                        </div>

                        {/* Barre de stock avec indicateurs */}
                        <div className="mb-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Stock actuel</span>
                            <span className="font-medium">{item.stock} / {item.max} max</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3 relative">
                            {/* Barre principale avec animation */}
                            <div
                              className={`${barColor} h-3 rounded-full transition-all duration-1000 ease-out`}
                              style={{ width: `${stockPercentage}%` }}
                            ></div>

                            {/* Indicateur niveau critique */}
                            <div
                              className="absolute h-full top-0 border-l-2 border-red-400 opacity-60"
                              style={{ left: `${criticalPercentage}%` }}
                              title="Niveau critique"
                            ></div>

                            {/* Indicateur niveau minimum */}
                            <div
                              className="absolute h-full top-0 border-l-2 border-orange-400 opacity-60"
                              style={{ left: `${minPercentage}%` }}
                              title="Niveau minimum"
                            ></div>
                          </div>

                          {/* Légende des indicateurs */}
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>Critique: {item.critical_level}</span>
                            <span>Min: {item.min}</span>
                            <span>Max: {item.max}</span>
                          </div>
                        </div>

                        {/* Informations détaillées */}
                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                            <span className="text-gray-600">Prix unitaire:</span>
                            <span className="font-medium ml-1">{formatCurrency(Number(item.unit_price) || 0)}</span>
                    </div>
                          <div>
                            <span className="text-gray-600">Fournisseur:</span>
                            <span className="font-medium ml-1">{item.supplier}</span>
                  </div>
                    <div>
                            <span className="text-gray-600">Usage moyen:</span>
                            <span className="font-medium ml-1">{item.average_usage}/jour</span>
                    </div>
                          <div>
                            <span className="text-gray-600">Durée estimée:</span>
                            <span className="font-medium ml-1">{item.estimated_duration} jours</span>
                  </div>
                </div>

                        {/* Informations de livraison */}
                        {item.next_delivery && (
                          <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-blue-700">Prochaine livraison:</span>
                              <span className={`font-medium ${item.delivery_days <= 7 ? 'text-red-600' : item.delivery_days <= 14 ? 'text-orange-600' : 'text-blue-600'}`}>
                                {item.next_delivery} ({item.delivery_days} jours)
                              </span>
              </div>
            </div>
                        )}

                        {/* Notes */}
                        {item.notes && (
                          <div className="text-xs text-gray-600 italic mb-3">
                            {item.notes}
          </div>
                        )}

                        {/* Actions */}
                        <div className="flex space-x-2">
                          {item.needs_restock && (
                            <button className="flex-1 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors">
                              Commander URGENT
                            </button>
                          )}
                          <button className="flex-1 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">
                            Voir détails
                          </button>
        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            return (
                <div className="space-y-4">
                    {/* En-tête avec statistiques */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center">
                            <Package className="h-5 w-5 text-blue-600 mr-2" />
                            <h3 className="text-lg font-semibold text-gray-900">Plan d'action stock & revente</h3>
                        </div>
                        <div className="flex space-x-3 text-sm">
                            <div className="text-center">
                                <div className="font-semibold text-green-600">
                                    {data.filter((item: any) => item.stock >= item.min).length}
                                </div>
                                <div className="text-gray-600">OK</div>
                            </div>
                            <div className="text-center">
                                <div className="font-semibold text-orange-600">
                                    {data.filter((item: any) => item.stock < item.min && item.stock >= item.critical_level).length}
                                </div>
                                <div className="text-gray-600">Faible</div>
                            </div>
                            <div className="text-center">
                                <div className="font-semibold text-red-600">
                                    {data.filter((item: any) => item.stock < item.critical_level).length}
                                </div>
                                <div className="text-gray-600">Critique</div>
                            </div>
                        </div>
                    </div>

                    {/* Graphique miniature */}
                    <div className="h-32 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart data={data.slice(0, 4)} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip
                                    formatter={(value: any) => [`${value} unités`, 'Stock']}
                                    contentStyle={{
                                        backgroundColor: 'white',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        fontSize: '12px'
                                    }}
                                />
                                <Bar
                                    dataKey="currentStock"
                                    fill="#3b82f6"
                                    radius={[2, 2, 0, 0]}
                                />
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Liste des articles */}
                    <div className="space-y-3">
                        {data.slice(0, 4).map((item: any, index: number) => {
                            const stockPercentage = Math.min((item.stock / item.max) * 100, 100);
                            const criticalPercentage = (item.critical_level / item.max) * 100;
                            const minPercentage = (item.min / item.max) * 100;

                            let barColor = 'bg-green-500';
                            let statusText = 'OK';
                            let statusColor = 'text-green-600';
                            let alertIcon = '✅';

                            if (item.stock < item.critical_level) {
                                barColor = 'bg-red-500';
                                statusText = 'CRITIQUE';
                                statusColor = 'text-red-600';
                                alertIcon = '🚨';
                            } else if (item.stock < item.min) {
                                barColor = 'bg-orange-500';
                                statusText = 'FAIBLE';
                                statusColor = 'text-orange-600';
                                alertIcon = '⚠️';
                            } else if (item.stock < item.min * 1.2) {
                                barColor = 'bg-yellow-500';
                                statusText = 'ATTENTION';
                                statusColor = 'text-yellow-600';
                                alertIcon = '⚡';
                            }

                            return (
                                <div key={index} className="p-2 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
                                    <div className="flex justify-between items-center text-xs mb-2">
                                        <div className="flex items-center space-x-2">
                                            <span>{alertIcon}</span>
                                            <span className="font-medium text-gray-700">{item.category}</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-gray-600">{item.stock} / {item.max}</span>
                                            <span className={`font-bold ${statusColor}`}>{statusText}</span>
                                        </div>
                                    </div>

                                    <div className="w-full bg-gray-200 rounded-full h-2.5 relative mb-1">
                                        {/* Barre principale avec animation */}
                                        <div
                                            className={`${barColor} h-2.5 rounded-full transition-all duration-1000 ease-out`}
                                            style={{ width: `${stockPercentage}%` }}
                                        ></div>

                                        {/* Indicateur niveau critique */}
                                        <div
                                            className="absolute h-full top-0 border-l border-red-400 opacity-60"
                                            style={{ left: `${criticalPercentage}%` }}
                                        ></div>

                                        {/* Indicateur niveau minimum */}
                                        <div
                                            className="absolute h-full top-0 border-l border-orange-400 opacity-60"
                                            style={{ left: `${minPercentage}%` }}
                                        ></div>
                                    </div>

                                    {/* Informations rapides */}
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>Usage: {item.average_usage}/j</span>
                                        <span>Durée: {item.estimated_duration}j</span>
                                        {item.delivery_days && (
                                            <span className={item.delivery_days <= 7 ? 'text-red-600 font-medium' : ''}>
                                                Livraison: {item.delivery_days}j
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        {data.length > 4 && (
                            <button onClick={() => onShowDetails(detailedInventoryView)} className="w-full mt-2 text-sm text-blue-600 hover:text-blue-700 font-semibold">
                                Voir tout le stock ({data.length} catégories)
                            </button>
                        )}
                    </div>
    </div>
  );

        default:
            return (
                <div className="text-center text-gray-500 py-4">
                    Données non disponibles
                </div>
            );
    }
  };

  return (
    <div className="space-y-4">
      {renderChart()}
    </div>
  );
};
