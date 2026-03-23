import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Lock, Save, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatEasternTimeForDisplay } from '../utils/dateUtils';

const Profile = () => {
  const { user, updateProfile, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || ''
  });
  const [viciId, setViciId] = useState(user?.vicidialAgentId || '');
  const [savingViciId, setSavingViciId] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [updating, setUpdating] = useState(false);

  // Check if user can edit profile (only admin and superadmin)
  const canEditProfile = ['admin', 'superadmin'].includes(user.role);
  // agent1 can self-manage their Vicidial Agent ID
  const canEditViciId = user.role === 'agent1';

  const handleViciIdSubmit = async (e) => {
    e.preventDefault();
    setSavingViciId(true);
    try {
      const result = await updateProfile({ vicidialAgentId: viciId.trim() });
      if (!result.success) {
        // error toast already shown by context
      }
    } catch (error) {
      console.error('Vicidial ID update error:', error);
    } finally {
      setSavingViciId(false);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setUpdating(true);

    try {
      const result = await updateProfile(profileData);
      if (result.success) {
        // Profile updated successfully (toast shown in context)
      }
    } catch (error) {
      console.error('Profile update error:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }

    setUpdating(true);

    try {
      const result = await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      if (result.success) {
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (error) {
      console.error('Password change error:', error);
    } finally {
      setUpdating(false);
    }
  };

  const getRoleBadge = (role) => {
    const badges = {
      superadmin: 'bg-red-100 text-red-800',
      admin: 'bg-purple-100 text-purple-800',
      agent1: 'bg-blue-100 text-blue-800',
      agent2: 'bg-green-100 text-green-800'
    };

    const roleNames = {
      superadmin: 'Super Administrator',
      admin: 'Administrator',
      agent1: 'Lead Generator',
      agent2: 'Lead Follower'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[role]}`}>
        {roleNames[role]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-full bg-primary-600 flex items-center justify-center">
              <span className="text-white text-lg font-medium">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="ml-4">
              <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
              <div className="flex items-center space-x-2">
                <span className="text-gray-600">{user.email}</span>
                <span className="text-gray-400">•</span>
                {getRoleBadge(user.role)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('profile')}
              className={`${
                activeTab === 'profile'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
            >
              <User className="h-4 w-4 mr-2 inline" />
              Profile Information
            </button>
            {canEditProfile && (
              <button
                onClick={() => setActiveTab('password')}
                className={`${
                  activeTab === 'password'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
              >
                <Lock className="h-4 w-4 mr-2 inline" />
                Change Password
              </button>
            )}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type="text"
                      id="name"
                      name="name"
                      disabled={!canEditProfile}
                      className={`appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md placeholder-gray-400 ${
                        canEditProfile 
                          ? 'focus:outline-none focus:ring-primary-500 focus:border-primary-500' 
                          : 'bg-gray-100 cursor-not-allowed'
                      }`}
                      value={profileData.name}
                      onChange={(e) => canEditProfile && setProfileData({ ...profileData, name: e.target.value })}
                    />
                    <User className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email Address
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type="email"
                      id="email"
                      name="email"
                      disabled={!canEditProfile}
                      className={`appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md placeholder-gray-400 ${
                        canEditProfile 
                          ? 'focus:outline-none focus:ring-primary-500 focus:border-primary-500' 
                          : 'bg-gray-100 cursor-not-allowed'
                      }`}
                      value={profileData.email}
                      onChange={(e) => canEditProfile && setProfileData({ ...profileData, email: e.target.value })}
                    />
                    <Mail className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Account Information</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <span className="text-sm text-gray-600">Role:</span>
                    <div className="mt-1">
                      {getRoleBadge(user.role)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Member since:</span>
                    <p className="text-sm text-gray-900 mt-1">
                      {formatEasternTimeForDisplay(user.createdAt, { includeTime: false })}
                    </p>
                  </div>
                  {(user.vicidialAgentId || canEditViciId) && (
                    <div>
                      <span className="text-sm text-gray-600">Vicidial Agent ID:</span>
                      <div className="mt-1">
                        {user.vicidialAgentId ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                            <Phone className="h-3 w-3 mr-1" />
                            {user.vicidialAgentId}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not set</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ViciDial Agent ID — editable by agent1 */}
              {canEditViciId && (
                <form onSubmit={handleViciIdSubmit}>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-md p-4 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Phone className="h-5 w-5 text-indigo-600" />
                      <h4 className="text-sm font-medium text-indigo-900">Vicidial Integration</h4>
                    </div>
                    <p className="text-xs text-indigo-700">
                      Set your Vicidial Agent ID so that live call data is automatically routed to your LMS dashboard when you answer a call.
                    </p>
                    <div className="relative">
                      <Phone className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={viciId}
                        onChange={(e) => setViciId(e.target.value)}
                        placeholder="e.g. AGENT001"
                        maxLength={50}
                        className="w-full pl-10 pr-3 py-2 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      />
                    </div>
                    {user.vicidialAgentId && (
                      <p className="text-xs text-indigo-600">
                        Current ID: <span className="font-semibold">{user.vicidialAgentId}</span>
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingViciId}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {savingViciId ? 'Saving...' : 'Save Vicidial ID'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {!canEditProfile && !canEditViciId && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        Profile View Only
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>Your profile information is managed by your administrator. Contact them if you need to make changes.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {canEditProfile && (
                <form onSubmit={handleProfileSubmit}>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={updating}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updating ? 'Updating...' : 'Update Profile'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'password' && canEditProfile && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                    Current Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type="password"
                      id="currentPassword"
                      name="currentPassword"
                      required
                      className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    />
                    <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                    New Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type="password"
                      id="newPassword"
                      name="newPassword"
                      required
                      className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    />
                    <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Password must be at least 6 characters long and contain at least one uppercase letter, one lowercase letter, and one number.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm New Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      required
                      className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    />
                    <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Password Security Tips
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Use a unique password you don't use elsewhere</li>
                        <li>Include numbers, symbols, and both uppercase and lowercase letters</li>
                        <li>Avoid using personal information like your name or birthdate</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updating}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {updating ? 'Updating...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
