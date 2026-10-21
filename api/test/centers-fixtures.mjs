// Synthetic identities only. Does not create roles in db.json or authorize actual accounts.
export const centersFixture = Object.freeze({
  centers: [{ id: 'center_a', name: 'Centro A' }, { id: 'center_b', name: 'Centro B' }],
  users: [
    { id: 'manager_a', name: 'Responsable A' }, { id: 'manager_b', name: 'Responsable B' },
    { id: 'trainer_a', name: 'Entrenador A' }, { id: 'multi_member', name: 'Socio multicentro' },
    { id: 'personal_only', name: 'Cuenta personal' },
  ],
  assignments: [
    { uid: 'manager_a', centerId: 'center_a', role: 'manager' },
    { uid: 'manager_b', centerId: 'center_b', role: 'manager' },
    { uid: 'trainer_a', centerId: 'center_a', role: 'trainer' },
  ],
  members: [
    { id: 'member_a', centerId: 'center_a', uid: 'multi_member' },
    { id: 'member_b', centerId: 'center_b', uid: 'multi_member' },
    { id: 'reception_only', centerId: 'center_a', uid: null },
  ],
});
