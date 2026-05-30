import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CompareRequest, CompareResult, ExportResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class TraceLineApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  compare(request: CompareRequest): Observable<CompareResult> {
    return this.http.post<CompareResult>(`${this.baseUrl}/compare`, request);
  }

  compareFiles(formData: FormData): Observable<CompareResult> {
    return this.http.post<CompareResult>(`${this.baseUrl}/compare/files`, formData);
  }

  exportHtml(result: CompareResult): Observable<ExportResponse> {
    return this.http.post<ExportResponse>(`${this.baseUrl}/export`, { result });
  }
}
