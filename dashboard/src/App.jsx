import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CallDetail from './pages/CallDetail';
import Calls from './pages/Calls';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Workflows from './pages/Workflows';
import Reports from './pages/Reports';
import Simulate from './pages/Simulate';
import Templates from './pages/Templates';
import Customers from './pages/Customers';
import DynamicCall from './pages/DynamicCall';
import Campaigns from './pages/Campaigns';
import ApiConfig from './pages/ApiConfig';
import CrmIntegration from './pages/CrmIntegration';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminOrganizations from './pages/SuperAdminOrganizations';
import SuperAdminPlans from './pages/SuperAdminPlans';
import SuperAdminUsage from './pages/SuperAdminUsage';
import SuperAdminRevenue from './pages/SuperAdminRevenue';
import Billing from './pages/Billing';
import CreditsBadge from './components/CreditsBadge';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}<CreditsBadge /></> : <Navigate to="/login" replace />;
}

function SuperAdminRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/calls" element={<ProtectedRoute><Calls /></ProtectedRoute>} />
        <Route path="/calls/:callId" element={<ProtectedRoute><CallDetail /></ProtectedRoute>} />
        <Route path="/workflows" element={<ProtectedRoute><Workflows /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/users" element={<SuperAdminRoute><Users /></SuperAdminRoute>} />
        <Route path="/settings" element={<SuperAdminRoute><Settings /></SuperAdminRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/dynamic-call" element={<ProtectedRoute><DynamicCall /></ProtectedRoute>} />
        <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
        <Route path="/simulate" element={<ProtectedRoute><Simulate /></ProtectedRoute>} />
        <Route path="/api-config" element={<SuperAdminRoute><ApiConfig /></SuperAdminRoute>} />
        <Route path="/crm" element={<ProtectedRoute><CrmIntegration /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="/superadmin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
        <Route path="/superadmin/organizations" element={<SuperAdminRoute><SuperAdminOrganizations /></SuperAdminRoute>} />
        <Route path="/superadmin/organizations/:id" element={<SuperAdminRoute><SuperAdminOrganizations /></SuperAdminRoute>} />
        <Route path="/superadmin/plans" element={<SuperAdminRoute><SuperAdminPlans /></SuperAdminRoute>} />
        <Route path="/superadmin/usage" element={<SuperAdminRoute><SuperAdminUsage /></SuperAdminRoute>} />
        <Route path="/superadmin/revenue" element={<SuperAdminRoute><SuperAdminRevenue /></SuperAdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
