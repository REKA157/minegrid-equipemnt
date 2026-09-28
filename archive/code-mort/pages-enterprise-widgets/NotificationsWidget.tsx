import React, { useState } from 'react';
import {
  Bell,
  CheckCircle,
  Clock,
  Info,
} from 'lucide-react';

export const NotificationsWidget = ({ data }: { data: any[] }) => {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'high'>('all');

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <Bell className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <Clock className="h-4 w-4 text-orange-600" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'alert':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-orange-200 bg-orange-50';
      case 'info':
        return 'border-blue-200 bg-blue-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-orange-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'À l\'instant';
    if (diffInHours === 1) return 'Il y a 1 heure';
    if (diffInHours < 24) return `Il y a ${diffInHours} heures`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Il y a 1 jour';
    return `Il y a ${diffInDays} jours`;
  };

  const filteredData = data.filter(notification => {
    if (filter === 'unread') return !notification.read;
    if (filter === 'high') return notification.priority === 'high';
    return true;
  });

  const unreadCount = data.filter(n => !n.read).length;
  const highPriorityCount = data.filter(n => n.priority === 'high').length;

  const displayedData = showAll ? filteredData : filteredData.slice(0, 3);

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Bell className="h-6 w-6 text-orange-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'unread' | 'high')}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="all">Toutes</option>
            <option value="unread">Non lues</option>
            <option value="high">Priorité haute</option>
          </select>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-red-50 rounded-lg">
          <div className="text-lg font-bold text-red-600">{highPriorityCount}</div>
          <div className="text-xs text-red-600">Urgentes</div>
        </div>
        <div className="text-center p-2 bg-orange-50 rounded-lg">
          <div className="text-lg font-bold text-orange-600">{unreadCount}</div>
          <div className="text-xs text-orange-600">Non lues</div>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <div className="text-lg font-bold text-blue-600">{data.length}</div>
          <div className="text-xs text-blue-600">Total</div>
        </div>
      </div>

      <div className="space-y-3">
        {displayedData.map((notification, index) => (
          <div
            key={notification.id}
            className={`border rounded-lg p-3 transition-all duration-200 hover:shadow-sm ${
              notification.read ? 'opacity-75' : ''
            } ${getTypeColor(notification.type)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center flex-1">
                {getTypeIcon(notification.type)}
                <div className="ml-2 flex-1">
                  <h4 className={`font-medium text-sm ${notification.read ? 'text-gray-600' : 'text-gray-900'}`}>
                    {notification.title}
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {notification.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getPriorityColor(notification.priority)}`} />
                <span className="text-xs text-gray-500">
                  {formatTimeAgo(notification.timestamp)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button className="text-orange-600 hover:text-orange-700 text-xs font-medium">
                  {notification.action}
                </button>
                {!notification.read && (
                  <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">
                    Marquer comme lue
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-500 capitalize">
                {notification.category}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredData.length > 3 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-orange-600 hover:text-orange-700 text-sm font-medium"
          >
            {showAll ? 'Voir moins' : `Voir toutes les ${filteredData.length} notifications`}
          </button>
        </div>
      )}

      {filteredData.length === 0 && (
        <div className="text-center py-8">
          <Bell className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">Aucune notification</p>
        </div>
      )}
    </div>
  );
};
