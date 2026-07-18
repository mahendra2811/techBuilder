'use client';

/**
 * Raise-request screen (SM + TH + Driver — one component, three thin wrappers).
 * A per-type form builds a sensible `payload` for SubmitRequestInput, plus a
 * list of the caller's OWN submitted requests with their statuses.
 *
 * The payload carries denormalized display labels (regNo / person name / type
 * name) next to the canonical ids, because the approver (e.g. a Team Head with
 * no fleet scope) cannot resolve those ids later — see request-bits.tsx.
 *
 * Request types offered per role:
 *   - DRIVER: VEHICLE_SWITCH only (their day-to-day need),
 *   - SM: LEAVE, MATERIAL, VEHICLE_SWITCH.
 * VEHICLE_SWITCH needs an in-scope vehicle.
 *
 * SUPERVISOR restructure: this screen no longer has a SUPERVISOR variant — he never
 * drove a vehicle himself (VEHICLE_SWITCH was the only active type for him and made no
 * product sense), so /supervisor/requests was removed. His crew-vehicle re-allotment is
 * direct (see supervisor-crew-vehicles-card.tsx, no request/approval), and his own
 * expense-request form moved to expense-request-screen.tsx (ExpenseRequestScreen).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type {
  ApprovalRequest,
  ApprovalType,
  SubmitRequestInput,
  UUID,
  Vehicle,
  VehicleType,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { PayloadSummary, RequestStatusBadge } from '@/components/requests/request-bits';

type SubmitRole = 'SITE_MANAGER' | 'DRIVER';

const TYPES_FOR: Record<SubmitRole, ApprovalType[]> = {
  DRIVER: ['VEHICLE_SWITCH'],
  // Phase-scoping 2026-07: LEAVE & MATERIAL are manual for now (see docs/techBuilder-Build-WorkOrders.md WO-1)
  SITE_MANAGER: ['VEHICLE_SWITCH'], // ['LEAVE', 'MATERIAL', 'VEHICLE_SWITCH'],
};

export function RequestsScreen({ role }: { role: SubmitRole }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const allowedTypes = TYPES_FOR[role];
  const [type, setType] = useState<ApprovalType>(allowedTypes[0]!);

  // VEHICLE_SWITCH (only active type in this phase; LEAVE/MATERIAL commented out)
  const [vehicleId, setVehicleId] = useState<UUID | ''>('');
  const [desiredTypeId, setDesiredTypeId] = useState<UUID | ''>('');
  const [vehicleReason, setVehicleReason] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const requestsQ = useQuery({ queryKey: ['requests', 'ALL'], queryFn: () => api<ApprovalRequest[]>('GET', '/requests') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const vehicleTypesQ = useQuery({ queryKey: ['vehicle-types'], queryFn: () => api<VehicleType[]>('GET', '/vehicle-types') });

  const myUserId = meQ.data?.user.id;
  const vehicles = vehiclesQ.data ?? [];
  const myRequests = (requestsQ.data ?? []).filter((r) => r.requestedBy === myUserId);

  const changeType = (t: ApprovalType) => {
    setType(t);
    setErrors({});
    setSubmitted(false);
  };

  const submit = useMutation({
    mutationFn: (input: SubmitRequestInput) => api<ApprovalRequest>('POST', '/requests', input),
    onSuccess: () => {
      setSubmitted(true);
      // reset the type-specific inputs, keep the picked type
      setVehicleId('');
      setDesiredTypeId('');
      setVehicleReason('');
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: () => setSubmitted(false),
  });

  const buildPayload = (): { payload: Record<string, unknown>; errs: Record<string, string> } => {
    const errs: Record<string, string> = {};
    let payload: Record<string, unknown> = {};

    // Phase-scoping 2026-07: only VEHICLE_SWITCH is active (see docs/techBuilder-Build-WorkOrders.md WO-1)
    if (!vehicleId) errs.vehicle = m.REQUESTS_UI.vehicleRequired;
    if (!vehicleReason.trim()) errs.reason = m.REQUESTS_UI.reasonRequired;
    const veh = vehicles.find((v) => v.id === vehicleId);
    const desired = vehicleTypesQ.data?.find((t) => t.id === desiredTypeId);
    payload = {
      vehicleId,
      vehicleRegNo: veh?.regNo,
      reason: vehicleReason.trim(),
      ...(desiredTypeId ? { desiredVehicleTypeId: desiredTypeId, desiredVehicleTypeName: desired?.name } : {}),
    };
    return { payload, errs };
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(false);
    const { payload, errs } = buildPayload();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    submit.mutate({ id: uuidv7(), type, payload });
  };

  const serverError =
    submit.error instanceof ApiClientError ? apiErrorMessage(m, submit.error.code) : submit.error ? apiErrorMessage(m) : null;

  const noVehicles = vehicles.length === 0;
  const submitDisabled = submit.isPending || (type === 'VEHICLE_SWITCH' && noVehicles);

  return (
    <div className="grid gap-4" data-testid="requests-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.REQUESTS_UI.newRequestTitle}</CardTitle>
          <CardDescription>{m.REQUESTS_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
            {allowedTypes.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="request-type">{m.REQUESTS_UI.typeLabel}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {allowedTypes.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={type === t ? 'default' : 'outline'}
                      aria-pressed={type === t}
                      data-testid={`request-type-${t}`}
                      onClick={() => changeType(t)}
                    >
                      {m.APPROVAL_TYPE_LABELS[t]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {type === 'VEHICLE_SWITCH' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="request-vehicle">{m.REQUEST_FIELDS.vehicle}</Label>
                  {vehiclesQ.isPending ? (
                    <LoadingState />
                  ) : noVehicles ? (
                    <Notice tone="warning" testId="request-no-vehicles">
                      {m.REQUESTS_UI.noVehiclesInScope}
                    </Notice>
                  ) : (
                    <NativeSelect
                      id="request-vehicle"
                      data-testid="request-vehicle"
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                    >
                      <option value="">{m.REQUESTS_UI.selectVehicle}</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.regNo}
                          {v.name ? ` · ${v.name}` : ''}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  {errors.vehicle && <p className="text-sm text-destructive" role="alert">{errors.vehicle}</p>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="request-desired-type">{m.REQUESTS_UI.optionalDesiredType}</Label>
                  <NativeSelect
                    id="request-desired-type"
                    data-testid="request-desired-type"
                    value={desiredTypeId}
                    onChange={(e) => setDesiredTypeId(e.target.value)}
                  >
                    <option value="">{m.REQUESTS_UI.none}</option>
                    {(vehicleTypesQ.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="request-vehicle-reason">{m.REQUEST_FIELDS.reason}</Label>
                  <Textarea
                    id="request-vehicle-reason"
                    data-testid="request-vehicle-reason"
                    placeholder={m.REQUESTS_UI.reasonPlaceholder}
                    value={vehicleReason}
                    onChange={(e) => setVehicleReason(e.target.value)}
                  />
                  {errors.reason && <p className="text-sm text-destructive" role="alert">{errors.reason}</p>}
                </div>
              </>
            )}

            {/* Phase-scoping 2026-07: LEAVE type is hidden (see docs/techBuilder-Build-WorkOrders.md WO-1)
            {type === 'LEAVE' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="request-leave-person">{m.REQUEST_FIELDS.person}</Label>
                  <NativeSelect
                    id="request-leave-person"
                    data-testid="request-leave-person"
                    value={leavePersonId}
                    onChange={(e) => setLeavePersonId(e.target.value)}
                  >
                    <option value="">{m.REQUEST_FIELDS.self}</option>
                    {(peopleQ.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="request-from">{m.REQUEST_FIELDS.fromDate}</Label>
                    <Input
                      id="request-from"
                      type="date"
                      data-testid="request-from"
                      value={fromDate}
                      onChange={(e) => e.target.value && setFromDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="request-to">{m.REQUEST_FIELDS.toDate}</Label>
                    <Input
                      id="request-to"
                      type="date"
                      data-testid="request-to"
                      value={toDate}
                      min={fromDate}
                      onChange={(e) => e.target.value && setToDate(e.target.value)}
                    />
                  </div>
                </div>
                {errors.dates && <p className="text-sm text-destructive" role="alert">{errors.dates}</p>}

                <div className="grid gap-2">
                  <Label htmlFor="request-leave-type">{m.REQUEST_FIELDS.leaveType}</Label>
                  <NativeSelect
                    id="request-leave-type"
                    data-testid="request-leave-type"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {m.LEAVE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="request-leave-reason">{m.REQUEST_FIELDS.reason}</Label>
                  <Textarea
                    id="request-leave-reason"
                    data-testid="request-leave-reason"
                    placeholder={m.REQUESTS_UI.notePlaceholder}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                  />
                </div>
              </>
            )}
            */}

            {/* Phase-scoping 2026-07: MATERIAL type is hidden (see docs/techBuilder-Build-WorkOrders.md WO-1)
            {type === 'MATERIAL' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="request-material">{m.REQUEST_FIELDS.material}</Label>
                  <Input
                    id="request-material"
                    data-testid="request-material"
                    placeholder={m.REQUESTS_UI.materialPlaceholder}
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                  />
                  {errors.material && <p className="text-sm text-destructive" role="alert">{errors.material}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="request-qty">{m.REQUEST_FIELDS.qty}</Label>
                    <Input
                      id="request-qty"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      data-testid="request-qty"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="request-uom">{m.REQUEST_FIELDS.uom}</Label>
                    <NativeSelect
                      id="request-uom"
                      data-testid="request-uom"
                      value={uom}
                      onChange={(e) => setUom(e.target.value as Uom)}
                    >
                      {UOMS.map((u) => (
                        <option key={u} value={u}>
                          {m.UOM_LABELS[u]}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                {errors.qty && <p className="text-sm text-destructive" role="alert">{errors.qty}</p>}

                <div className="grid gap-2">
                  <Label htmlFor="request-note">{m.REQUEST_FIELDS.note}</Label>
                  <Textarea
                    id="request-note"
                    data-testid="request-note"
                    placeholder={m.REQUESTS_UI.notePlaceholder}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </>
            )}
            */}

            {serverError && (
              <Notice tone="error" testId="request-error">
                {serverError}
              </Notice>
            )}
            {submitted && (
              <Notice tone="success" testId="request-submitted">
                {m.REQUESTS_UI.submitted}
              </Notice>
            )}

            <Button type="submit" data-testid="request-submit" disabled={submitDisabled}>
              {submit.isPending ? m.REQUESTS_UI.submitting : m.REQUESTS_UI.submit}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card size="sm" data-testid="my-requests">
        <CardHeader>
          <CardTitle>{m.REQUESTS_UI.myRequestsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {requestsQ.isPending || meQ.isPending ? (
            <LoadingState />
          ) : requestsQ.error ? (
            <ErrorState error={requestsQ.error} onRetry={() => void requestsQ.refetch()} />
          ) : myRequests.length === 0 ? (
            <EmptyState label={m.REQUESTS_UI.myRequestsEmpty} />
          ) : (
            <ul className="grid gap-3">
              {myRequests.map((r) => (
                <li key={r.id} className="grid gap-1.5 rounded-lg border border-input p-3" data-testid={`my-request-${r.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{m.APPROVAL_TYPE_LABELS[r.type]}</p>
                    <RequestStatusBadge status={r.status} />
                  </div>
                  <PayloadSummary type={r.type} payload={r.payload} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
