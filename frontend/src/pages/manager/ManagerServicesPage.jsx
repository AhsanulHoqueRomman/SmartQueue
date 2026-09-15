import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

export function ManagerServicesPage() {
  const { currentOrg } = useTenant();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 30,
    price: '',
    is_active: true,
  });

  const fetchServices = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const data = await managerService.getServices(currentOrg.id);
      setServices(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load service catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [currentOrg?.id]);

  const handleOpenCreateModal = () => {
    setEditingService(null);
    setFormData({
      name: '',
      description: '',
      duration_minutes: 30,
      price: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (service) => {
    setEditingService(service);
    setFormData({
      name: service.name || '',
      description: service.description || '',
      duration_minutes: service.duration_minutes || 30,
      price: service.price || '',
      is_active: service.is_active !== false,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);

    const payload = {
      name: formData.name,
      description: formData.description,
      duration_minutes: parseInt(formData.duration_minutes, 10),
      is_active: formData.is_active,
    };
    if (formData.price !== '') {
      payload.price = parseFloat(formData.price);
    }

    try {
      if (editingService) {
        await managerService.updateService(currentOrg.id, editingService.id, payload);
        setFeedback({ type: 'success', message: 'Service updated successfully!' });
      } else {
        await managerService.createService(currentOrg.id, payload);
        setFeedback({ type: 'success', message: 'New service created!' });
      }
      setModalOpen(false);
      fetchServices();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.name?.[0] ||
        err.response?.data?.duration_minutes?.[0] ||
        'Failed to save service.';
      setError(msg);
    }
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;
    setFeedback(null);
    try {
      await managerService.deleteService(currentOrg.id, serviceId);
      setFeedback({ type: 'success', message: 'Service deleted.' });
      fetchServices();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to delete service.',
      });
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header dropdown above."
      />
    );
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Services Catalog</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Configure offered services, durations, and pricing rules for {currentOrg.name}.</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          + Create New Service
        </button>
      </div>

      {feedback && (
        <div
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            background: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      <div className="card animate-section stagger-1">
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={5} />
        ) : services.length === 0 ? (
          <EmptyState
            title="No Services Configured"
            message="Your organization has no services in its catalog."
            actionLabel="Create First Service"
            onAction={handleOpenCreateModal}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Service Name</th>
                  <th>Duration</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => (
                  <tr key={svc.id}>
                    <td>
                      <div className="font-semibold">{svc.name}</div>
                      {svc.description && <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>{svc.description}</div>}
                    </td>
                    <td>{svc.duration_minutes} min</td>
                    <td>{svc.price ? `$${svc.price}` : 'Free'}</td>
                    <td>
                      <span className={`badge ${svc.is_active !== false ? 'badge-success' : 'badge-neutral'}`}>
                        {svc.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex justify-end gap-xs">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleOpenEditModal(svc)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(svc.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingService ? 'Edit Service' : 'Create New Service'}</h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">Service Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="General Consultation, Dental Checkup..."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description (optional)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="Short description of service..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="grid-responsive grid-cols-2">
                  <div className="form-group">
                    <label className="form-label">Duration (minutes)</label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      value={formData.duration_minutes}
                      onChange={(e) =>
                        setFormData({ ...formData, duration_minutes: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price ($ optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="0.00"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="flex items-center gap-xs text-sm" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    Is Active for Customer Discovery
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingService ? 'Update Service' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerServicesPage;
