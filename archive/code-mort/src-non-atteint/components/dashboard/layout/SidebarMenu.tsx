import React from 'react';

interface SidebarMenuProps {
  collapsed: boolean;
  selectedUserType: string;
  userTypes: string[];
  onUserTypeChange: (userType: string) => void;
  onNavigation: (path: string) => void;
}

const SidebarMenu: React.FC<SidebarMenuProps> = ({
  collapsed,
  selectedUserType,
  userTypes,
  onUserTypeChange,
  onNavigation
}) => {
  const getUserTypeIcon = (userType: string) => {
    switch (userType) {
      case 'vendeur':
        return '💰';
      case 'loueur':
        return '🏗️';
      case 'transitaire':
        return '📦';
      case 'transporteur':
        return '🚛';
      case 'mecanicien':
        return '🔧';
      case 'financier':
        return '📊';
      default:
        return '👤';
    }
  };

  const getUserTypeLabel = (userType: string) => {
    switch (userType) {
      case 'vendeur':
        return 'Vendeur';
      case 'loueur':
        return 'Loueur';
      case 'transitaire':
        return 'Transitaire';
      case 'transporteur':
        return 'Transporteur';
      case 'mecanicien':
        return 'Mécanicien';
      case 'financier':
        return 'Financier';
      default:
        return userType;
    }
  };

  return (
    <div className={`fixed left-0 top-0 h-full bg-white shadow-lg border-r border-gray-200 transition-all duration-300 z-50 ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      <div className="p-4">
        {!collapsed && (
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Types d'utilisateurs</h3>
        )}
        
        <div className="space-y-2">
          {userTypes.map((userType) => (
            <button
              key={userType}
              onClick={() => onUserTypeChange(userType)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                selectedUserType === userType
                  ? 'bg-blue-100 text-blue-700'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="text-lg">{getUserTypeIcon(userType)}</span>
              {!collapsed && (
                <span className="font-medium">{getUserTypeLabel(userType)}</span>
              )}
            </button>
          ))}
        </div>

        {!collapsed && (
          <div className="mt-8 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Navigation</h4>
            <div className="space-y-1">
              <button
                onClick={() => onNavigation('/machines')}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                🚜 Machines
              </button>
              <button
                onClick={() => onNavigation('/equipment')}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                🛠️ Équipements
              </button>
              <button
                onClick={() => onNavigation('/services')}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                🎯 Services
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarMenu; 