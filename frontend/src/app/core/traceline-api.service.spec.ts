import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { TraceLineApiService } from './traceline-api.service';
import { CompareRequest, CompareResult } from '../models';

describe('TraceLineApiService', () => {
  let service: TraceLineApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TraceLineApiService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(TraceLineApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('posts compare requests', () => {
    const requestBody: CompareRequest = {
      leftText: 'one',
      rightText: 'two'
    };
    let response: CompareResult | undefined;

    service.compare(requestBody).subscribe((result) => {
      response = result;
    });

    const request = http.expectOne('/api/compare');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(requestBody);
    request.flush(resultFixture);

    expect(response?.summary.changedCount).toBe(1);
  });

  it('posts export requests with the existing comparison result', () => {
    service.exportHtml(resultFixture).subscribe();

    const request = http.expectOne('/api/export');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.format).toBeUndefined();
    expect(request.request.body.result).toEqual(resultFixture);
    request.flush({
      fileName: 'traceline-comparison.html',
      content: '<h1>TraceLine Comparison</h1>',
      contentType: 'text/html',
    });
  });

});

const resultFixture: CompareResult = {
  mode: 'line',
  leftText: 'one',
  rightText: 'two',
  operations: [{ type: 'changed', left: 'one', right: 'two' }],
  summary: {
    similarityScore: 50,
    addedCount: 0,
    removedCount: 0,
    changedCount: 1,
    totalLines: 1,
    addedLines: 0,
    removedLines: 0,
    changedLines: 1,
    totalWords: 1,
    changedWords: 1,
    totalCharacters: 3,
    changedCharacters: 3,
    processingTimeMillis: 1
  }
};
