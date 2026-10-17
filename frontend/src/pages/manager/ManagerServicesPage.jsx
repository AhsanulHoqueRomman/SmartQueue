import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import { normalizePaginatedResponse, DEFAULT_PAGE_SIZE } from '../../utils/paginationUtils';
import { formatCurrency } from '../../utils/bookingDisplay';

const TABLE_COLUMNS = [
  { key: 'name', label: 'Service Name' },
  { key: 'duration', label: 'Duration' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', align: 'right' },
];

/**
 * Renders service price according to QueueTurn currency standards:
 * - Zero price displays "Free"
 * - Positive price displays formatted BDT (e.g. "৳15.00")
 * - Missing/null/invalid displays "Price unavailable"
 */
function renderServicePrice(price) {
  if (price === null || price === undefined || price === '') {
    return 'Price unavailable';
  }
  const num = Number(price);
  if (!Number.isFinite(num)) {
    return 'Price unavailable';
  }
  if (num === 0) {
    return 'Free';
  }
  return formatCurrency(num);
}

export function ManagerServicesPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Search: draft vs applied
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'true' | 'false'

  // Pagination state
  const [page, setPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState({
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    hasNext: false,
    hasPrevious: false,
    itemRange: { start: 0, end: 0, total: 0 },
  });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 30,
    price: '',
    is_active: true,
  });

  // Request & tenant tracking
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  const fetchServices = useCallback(async (targetPage, searchToApply, statusToApply) => {
    if (!currentOrg?.id) return;

    const requestId = ++activeRequestIdRef.current;
    const orgIdAtRequest = currentOrg.id;
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: targetPage,
        page_size: DEFAULT_PAGE_SIZE,
      };
      if (searchToApply) params.search = searchToApply;
      if (statusToApply !== '') params.is_active = statusToApply;

      const data = await managerService.getServices(orgIdAtRequest, params);

      // Discard response if organization switched or newer query started
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      const normalized = normalizePaginatedResponse(data, targetPage, DEFAULT_PAGE_SIZE);
      setServices(normalized.items);
      setPaginationInfo(normalized);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current || orgIdAtRequest !== currentOrg?.id) {
        return;
      }

      // If page > 1 returned backend pagination 404, recover to previous page
      const isPaginationEmptyPage =
        err.response?.status === 404 &&
        targetPage > 1 &&
        err.response?.data?.detail === 'That page contains no results.';

      if (isPaginationEmptyPage) {
        setPage((prev) => Math.max(1, prev - 1));
        return;
      }

      setError(err.response?.data?.detail || 'Failed to load service catalog.');
    } finally {
      if (requestId === activeRequestIdRef.current && orgIdAtRequest === currentOrg?.id) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id]);

  // Reset state when switching active organization
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      activeRequestIdRef.current += 1;
      setPage(1);
      setSearchInput('');
      setAppliedSearch('');
      setStatusFilter('');
      setServices([]);
      setPaginationInfo({
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrevious: false,
        itemRange: { start: 0, end: 0, total: 0 },
      });
      setFeedback(null);
      setError(null);
    }
  }, [currentOrg?.id]);

  // Fetch when active org, page, applied search, or status filter changes
  useEffect(() => {
    fetchServices(page, appliedSearch, statusFilter);
  }, [fetchServices, page, appliedSearch, statusFilter]);

  const handleSearchSubmit = () => {
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed);
    setPage(1);
  };

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

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
    if (!currentOrg?.id) return;
    const orgIdAtAction = currentOrg.id;
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
        await managerService.updateService(orgIdAtAction, editingService.id, payload);
        if (orgIdAtAction === currentOrg?.id) {
          showSuccess(`Service "${formData.name}" updated successfully!`);
        }
      } else {
        await managerService.createService(orgIdAtAction, payload);
        if (orgIdAtAction === currentOrg?.id) {
          showSuccess(`Service "${formData.name}" created successfully!`);
        }
      }
      setModalOpen(false);
      if (orgIdAtAction === currentOrg?.id) {
        fetchServices(page, appliedSearch, statusFilter);
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.name?.[0] ||
        err.response?.data?.duration_minutes?.[0] ||
        'Failed to save service.';
      showError(msg);
      setError(msg);
    }
  };

  const handleDelete = async (serviceId) => {
    if (!currentOrg?.id) return;
    const orgIdAtAction = currentOrg.id;

    if (!window.confirm('Are you sure you want to delete this service?')) return;
    try {
      await managerService.deleteService(orgIdAtAction, serviceId);
      if (orgIdAtAction === currentOrg?.id) {
        showSuccess('Service deleted successfully.');
        fetchServices(page, appliedSearch, statusFilter);
      }
    } catch (err) {
      if (orgIdAtAction === currentOrg?.id) {
        showError(err.response?.data?.detail || 'Failed to delete service.');
      }
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

  const isFiltered = Boolean(appliedSearch || statusFilter || searchInput);

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Services Catalog</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Configure offered services, durations, and pricing rules for {currentOrg.name}.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          + Create New Service
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            background: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="error-banner"
          style={{
            padding: '1rem',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Accessible Search & Filter Toolbar (Open layout, no heavy card nesting) */}
      <SearchFilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        searchPlaceholder="Search service name, description..."
        searchLabel="Search services catalog"
        filters={[
          {
            id: 'service-status-filter',
            label: 'Status Filter',
            value: statusFilter,
            onChange: handleStatusChange,
            options: [
              { value: '', label: 'All Statuses' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ],
          },
        ]}
        isFiltered={isFiltered}
        onClear={handleClearFilters}
        isLoading={loading}
      />

      {/* Table & Pagination Content Surface */}
      <div>
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={5} />
        ) : services.length === 0 ? (
          <EmptyState
            title={isFiltered ? 'No Matching Services' : 'No Services Configured'}
            message={
              isFiltered
                ? 'No services matched your query filters.'
                : `Your organization (${currentOrg.name}) has no services in its catalog.`
            }
            actionLabel={isFiltered ? 'Clear Filters' : 'Create First Service'}
            onAction={isFiltered ? handleClearFilters : handleOpenCreateModal}
          />
        ) : (
          <div className="qt-table-surface">
            <ResponsiveTable
              caption={`Services Catalog for ${currentOrg.name}`}
              columns={TABLE_COLUMNS}
            >
              {services.map((svc) => (
                <tr key={svc.id}>
                  <td>
                    <div className="font-semibold">{svc.name}</div>
                    {svc.description && (
                      <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                        {svc.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="qt-tabular-num">{svc.duration_minutes}</span> min
                  </td>
                  <td>
                    <span className="qt-tabular-num">{renderServicePrice(svc.price)}</span>
                  </td>
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
                        aria-label={`Edit service ${svc.name}`}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(svc.id)}
                        aria-label={`Delete service ${svc.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </ResponsiveTable>

            <Pagination
              currentPage={paginationInfo.currentPage}
              totalPages={paginationInfo.totalPages}
              totalCount={paginationInfo.totalCount}
              itemRange={paginationInfo.itemRange}
              onPageChange={handlePageChange}
              disabled={loading}
              ariaLabel="Services catalog pagination"
            />
          </div>
        )}
      </div>

      {/* Modal Form */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingService ? 'Edit Service' : 'Create New Service'}</h3>
              <button
                className="modal-close-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label" htmlFor="service-name-input">Service Name</label>
                  <input
                    id="service-name-input"
                    type="text"
                    className="form-control"
                    placeholder="General Consultation, Dental Checkup..."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="service-description-input">Description (optional)</label>
                  <textarea
                    id="service-description-input"
                    className="form-control"
                    rows="3"
                    placeholder="Short description of service..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="grid-responsive grid-cols-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="service-duration-input">Duration (minutes)</label>
                    <input
                      id="service-duration-input"
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
                    <label className="form-label" htmlFor="service-price-input">Price (৳, optional)</label>
                    <input
                      id="service-price-input"
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
