/**
 * V6 Preview System - Request Cancellation
 * 
 * Handles request ID tracking to prevent visual glitches
 * when user moves cursor faster than preview can complete.
 */

export class RequestCancellation {
  private currentRequestId: number = 0;
  private activeRequests: Set<number> = new Set();
  
  /**
   * Start new preview request
   * Automatically cancels all previous requests
   */
  startPreview(): number {
    // Cancel all previous requests
    this.cancelAll();
    
    // Generate new request ID
    this.currentRequestId++;
    this.activeRequests.add(this.currentRequestId);
    
    return this.currentRequestId;
  }
  
  /**
   * Check if request is still valid (hasn't been superseded)
   */
  isValid(requestId: number): boolean {
    return this.activeRequests.has(requestId) && requestId === this.currentRequestId;
  }
  
  /**
   * Cancel specific request
   */
  cancel(requestId: number): void {
    this.activeRequests.delete(requestId);
  }
  
  /**
   * Cancel all active requests
   */
  cancelAll(): void {
    this.activeRequests.clear();
  }
  
  /**
   * Mark request as complete
   */
  complete(requestId: number): void {
    this.activeRequests.delete(requestId);
  }
  
  /**
   * Get current request ID
   */
  getCurrentRequestId(): number {
    return this.currentRequestId;
  }
  
  /**
   * Check if any requests are active
   */
  hasActiveRequests(): boolean {
    return this.activeRequests.size > 0;
  }
}
