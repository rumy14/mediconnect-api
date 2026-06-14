/** API response helpers */

export function success<T>(data: T, message?: string) {
  return { success: true as const, data, message };
}

export function paginated<T>(data: T[], total: number, page: number, limit: number) {
  return {
    success: true as const,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
